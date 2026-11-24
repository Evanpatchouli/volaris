#include "aggregate.h"
#include "windows_scan.h"

#include <windows.h>

#include <algorithm>
#include <optional>
#include <string_view>
#include <unordered_map>
#include <unordered_set>
#include <utility>

namespace volaris {
namespace {

std::wstring normalize(std::wstring value) {
  std::replace(value.begin(), value.end(), L'\\', L'/');
  value.erase(std::unique(value.begin(), value.end(), [](wchar_t a, wchar_t b) {
    return a == L'/' && b == L'/';
  }), value.end());
  if (std::all_of(value.begin(), value.end(), [](wchar_t ch) { return ch <= 127; })) {
    for (auto& ch : value) {
      if (ch >= L'A' && ch <= L'Z') ch += L'a' - L'A';
    }
    return value;
  }
  const int length = LCMapStringEx(LOCALE_NAME_INVARIANT, LCMAP_LOWERCASE,
                                   value.c_str(), -1, nullptr, 0, nullptr, nullptr, 0);
  std::wstring mapped(length, L'\0');
  if (!length || !LCMapStringEx(LOCALE_NAME_INVARIANT, LCMAP_LOWERCASE, value.c_str(),
                                -1, mapped.data(), length, nullptr, nullptr, 0)) {
    throw ScanError("ERR_NTFS_SCAN", "Cannot normalize a UTF-16 path for ignore rules");
  }
  mapped.pop_back();  // LCMapStringEx includes the terminating NUL.
  return mapped;
}

// An ignored ancestor is never queued. Most rules therefore require only a
// basename lookup. A rule containing a separator can span parent and child.
class IgnoreRules {
 public:
  explicit IgnoreRules(const std::vector<std::wstring>& rules) {
    for (const auto& rule : rules) {
      auto value = normalize(rule);
      if (value.find(L'/') == std::wstring::npos) names.insert(std::move(value));
      else path_patterns.push_back(L"/" + value + L"/");
    }
  }

  bool matches_root(const std::wstring& root) const {
    auto path = normalize(root) + L"/";
    for (const auto& name : names) {
      if (path.find(L"/" + name + L"/") != std::wstring::npos) return true;
    }
    return matches_pattern(path);
  }

  bool matches_child(const std::wstring& parent, const std::wstring& name) const {
    if (names.empty() && path_patterns.empty()) return false;
    auto basename = normalize(name);
    if (names.count(basename)) return true;
    return !path_patterns.empty() && matches_pattern(parent + basename + L"/");
  }

  std::wstring normalized_prefix(const std::wstring& path) const {
    if (path_patterns.empty()) return {};
    auto prefix = normalize(path);
    if (prefix.back() != L'/') prefix += L'/';
    return prefix;
  }

 private:
  bool matches_pattern(const std::wstring& path) const {
    return std::any_of(path_patterns.begin(), path_patterns.end(), [&](const auto& pattern) {
      return path.find(pattern) != std::wstring::npos;
    });
  }
  std::unordered_set<std::wstring> names;
  std::vector<std::wstring> path_patterns;
};

struct Pending {
  uint64_t id;
  std::wstring path;
  unsigned level;
  std::optional<size_t> target;
  size_t tree_node = 0;
};

}  // namespace

std::vector<Result> scan(const std::wstring& root, unsigned depth,
                         const std::vector<std::wstring>& ignore_rules, bool include_tree) {
  const auto volume = index_volume(root);
  const IgnoreRules ignore(ignore_rules);
  if (ignore.matches_root(root)) return {};

  using Children = std::unordered_map<std::wstring_view, uint64_t>;
  std::unordered_map<uint64_t, Children> by_parent;
  for (const auto& dir : volume.directories) {
    by_parent[dir.parent].emplace(dir.name, dir.id);
  }

  std::vector<Result> results;
  std::vector<Pending> stack{{volume.root_id, root, 0, std::nullopt}};
  std::unordered_set<uint64_t> visited{volume.root_id};
  const Children empty;
  std::vector<Entry> entries;

  while (!stack.empty()) {
    auto current = std::move(stack.back());
    stack.pop_back();
    Result* target = current.target ? &results[*current.target] : nullptr;
    const auto indexed = by_parent.find(current.id);
    const Children& children = indexed == by_parent.end() ? empty : indexed->second;
    // Known leaves above the requested depth cannot contribute a target.
    if (!target && current.level > 0 && children.empty()) continue;
    entries.clear();
    if (!read_directory(current.path, entries)) {
      if (current.level == 0 && depth == 1) {
        throw ScanError("ERR_NTFS_SCAN", "Cannot enumerate the scan root directory");
      }
      if (target) ++target->errorCount;
      continue;
    }
    if (target) ++target->dirCount;
    uint64_t direct_bytes = 0;
    const auto prefix = ignore.normalized_prefix(current.path);
    if (current.path.back() != L'\\' && current.path.back() != L'/') current.path += L'\\';
    for (const auto& entry : entries) {
      const bool directory = (entry.attributes & FILE_ATTRIBUTE_DIRECTORY) != 0;
      if (!directory && !target) continue;
      if ((entry.attributes & FILE_ATTRIBUTE_REPARSE_POINT) ||
          ignore.matches_child(prefix, entry.name)) {
        if (target) ++target->skippedCount;
        continue;
      }
      auto path = current.path + entry.name;
      if (!directory) {
        uint64_t bytes;
        if (read_file_size(path, bytes)) {
          ++target->fileCount;
          direct_bytes += bytes;
        } else {
          ++target->errorCount;
        }
        continue;
      }

      // A live entry without a matching MFT record may have been moved or
      // created since enumeration. A repeated FRN cannot be a new subtree.
      const auto child = children.find(entry.name);
      if (child == children.end() || !visited.insert(child->second).second) {
        if (target) ++target->skippedCount;
        continue;
      }
      const auto level = current.level + 1;
      auto owner = current.target;
      if (level == depth) {
        owner = results.size();
        results.push_back({path, entry.name});
      }
      size_t child_node = 0;
      if (include_tree && owner) {
        auto& tree = results[*owner].tree;
        child_node = tree.size();
        const int64_t parent = target ? static_cast<int64_t>(current.tree_node) : -1;
        tree.push_back({parent, entry.name});
      }
      stack.push_back({child->second, std::move(path), level, owner, child_node});
    }
    if (target) {
      target->size += direct_bytes;
      if (include_tree) target->tree[current.tree_node].size = direct_bytes;
    }
  }
  if (include_tree) {
    for (auto& row : results) {
      // Parents enter the array first, so one reverse pass adds each subtree once.
      for (size_t end = row.tree.size(); end > 1; --end) {
        const auto& node = row.tree[end - 1];
        row.tree[static_cast<size_t>(node.parent)].size += node.size;
      }
    }
  }
  return results;
}

}  // namespace volaris
