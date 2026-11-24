#ifdef NDEBUG
#undef NDEBUG  // Run the assertions in both Debug and Release builds.
#endif

#include "../cpp/aggregate.h"
#include "../cpp/windows_scan.h"

#include <windows.h>

#include <algorithm>
#include <cassert>
#include <map>
#include <set>

using namespace volaris;

namespace {
const std::wstring root = L"D:\\scope";
constexpr uint64_t root_id = 0x9000000000005;
constexpr uint64_t large_size = (uint64_t{1} << 32) + 1;
VolumeIndex volume;
std::map<std::wstring, std::vector<Entry>> listings;
std::set<std::wstring> opened;
std::map<std::wstring, uint64_t> sizes;
std::set<std::wstring> files_queried;

const Result& lookup(const std::vector<Result>& results, const wchar_t* name) {
  const auto it = std::find_if(results.begin(), results.end(), [&](const Result& row) {
    return row.name == name;
  });
  assert(it != results.end());
  return *it;
}
}  // namespace

namespace volaris {
VolumeIndex index_volume(const std::wstring&) { return volume; }

bool read_directory(const std::wstring& path, std::vector<Entry>& entries) {
  assert(opened.insert(path).second);  // At most one directory listing per scan.
  auto it = listings.find(path);
  if (it == listings.end()) return false;
  entries = it->second;
  return true;
}

bool read_file_size(const std::wstring& path, uint64_t& bytes) {
  assert(files_queried.insert(path).second);
  auto it = sizes.find(path);
  if (it == sizes.end()) return false;
  bytes = it->second;
  return true;
}
}  // namespace volaris

int main() {
  const auto dir = FILE_ATTRIBUTE_DIRECTORY;
  const auto link = FILE_ATTRIBUTE_REPARSE_POINT;
  const auto alpha_path = root + L"\\alpha";
  const std::vector<std::wstring> rules{L".git", L"cache", L"\u00fcber.skip",
                                        L"ALPHA///Sub\\private"};

  // Include out-of-order parents, a cycle, an orphan and entries which exist
  // only in one of the two data sources after a rename.
  volume = {root_id, {
    {10, 6, L"unreachable"}, {6, 1, L"blocked"}, {9, 3, L"private"},
    {2, root_id, L"empty"}, {3, 1, L"sub"}, {1, root_id, L"alpha"},
    {root_id, 1, L"cycle"}, {4, root_id, L".GiT"}, {5, 1, L"Cache"},
    {7, 99, L"orphan"}, {8, 1, L"removed"}, {11, 1, L"junction"},
  }};
  listings = {
    {root, {{L"loose-file", 0}, {L"alpha", dir}, {L"empty", dir},
            {L".GiT", dir}, {L"orphan", dir}}},
    {alpha_path, {{L"file", 0}, {L"hard-link", 0}, {L"vanished", 0},
                  {L"sub", dir}, {L"blocked", dir}, {L"Cache", dir},
                  {L"file-link", link}, {L"junction", dir | link},
                  {L"created", dir}, {L"cycle", dir}}},
    {alpha_path + L"\\sub", {{L".github", 0}, {L"\u00dcBER.SKIP", 0}, {L"private", dir}}},
    {root + L"\\empty", {}},
  };
  sizes = {{alpha_path + L"\\file", large_size}, {alpha_path + L"\\hard-link", large_size},
           {alpha_path + L"\\sub\\.github", 7}};

  auto rows = scan(root, 1, rules);
  assert(rows.size() == 2);
  const auto& alpha = lookup(rows, L"alpha");
  assert(alpha.path == alpha_path && alpha.size == 2 * large_size + 7);
  assert(alpha.fileCount == 3 && alpha.dirCount == 2);
  assert(alpha.errorCount == 2 && alpha.skippedCount == 7);
  assert(lookup(rows, L"empty").dirCount == 1);
  assert(alpha.tree.empty() && lookup(rows, L"empty").tree.empty());
  assert(alpha.largest_files.empty() && lookup(rows, L"empty").largest_files.empty());
  assert(opened.size() == 5);
  const std::set<std::wstring> expected_files{alpha_path + L"\\file", alpha_path + L"\\hard-link",
                                              alpha_path + L"\\vanished", alpha_path + L"\\sub\\.github"};
  assert(files_queried == expected_files);

  opened.clear();
  files_queried.clear();
  rows = scan(root, 2, rules, true);
  assert(rows.size() == 2);
  const auto& sub = lookup(rows, L"sub");
  assert(sub.path == alpha_path + L"\\sub" && sub.size == 7);
  assert(sub.fileCount == 1 && sub.dirCount == 1 && sub.skippedCount == 2);
  const auto& blocked = lookup(rows, L"blocked");
  assert(blocked.dirCount == 0 && blocked.errorCount == 1);
  assert(blocked.tree.size() == 1 && blocked.tree[0].name == blocked.name);
  assert(blocked.tree[0].parent == -1 && blocked.tree[0].size == 0);
  assert(sub.tree.size() == 1 && sub.tree[0].name == sub.name && sub.tree[0].size == sub.size);
  assert(!opened.count(root + L"\\empty"));
  assert(!opened.count(alpha_path + L"\\blocked\\unreachable"));
  assert(files_queried.size() == 1 && files_queried.count(alpha_path + L"\\sub\\.github"));

  opened.clear();
  assert(scan(root, 1, {L"scope"}).empty());
  assert(opened.empty());

  volume.directories.push_back({12, 3, L"nested"});
  listings[alpha_path + L"\\sub"].push_back({L"nested", dir});
  listings[alpha_path + L"\\sub\\nested"] = {{L"payload", 0}};
  sizes[alpha_path + L"\\sub\\nested\\payload"] = 23;
  files_queried.clear();
  rows = scan(root, 1, rules, true);
  const auto& with_tree = lookup(rows, L"alpha");
  const auto& tree = with_tree.tree;
  assert(tree.size() == 4 && tree[0].parent == -1 && tree[0].name == with_tree.name);
  assert(tree[0].size == with_tree.size && with_tree.size == 2 * large_size + 30);
  for (size_t i = 1; i < tree.size(); ++i) {
    const auto& node = tree[i];
    assert(node.parent >= 0 && static_cast<size_t>(node.parent) < i);
    if (node.name == L"sub") {
      assert(node.parent == 0 && node.size == 30);
    } else if (node.name == L"nested") {
      assert(tree[node.parent].name == L"sub" && node.size == 23);
    } else {
      assert(node.name == L"blocked" && node.parent == 0 && node.size == 0);
    }
  }
  const auto& empty = lookup(rows, L"empty");
  assert(empty.tree.size() == 1 && empty.tree[0].parent == -1 && empty.tree[0].size == 0);
  assert(files_queried.size() == expected_files.size() + 1);

  // A single limit covers every target. The earlier UTF-16 path displaces
  // an equal-sized file even if traversal visited the other target first.
  const auto other_path = root + L"\\empty";
  listings[other_path] = {{L"tie", 0}, {L"leader", 0}, {L"zero", 0}};
  sizes[other_path + L"\\tie"] = large_size;
  sizes[other_path + L"\\leader"] = large_size + 1;
  sizes[other_path + L"\\zero"] = 0;
  opened.clear();
  files_queried.clear();
  rows = scan(root, 1, rules, true, 2);
  const auto& ranked_alpha = lookup(rows, L"alpha");
  const auto& ranked_other = lookup(rows, L"empty");
  assert(ranked_alpha.tree[0].size == ranked_alpha.size);
  assert(ranked_alpha.largest_files.size() == 1 && ranked_other.largest_files.size() == 1);
  assert(ranked_alpha.largest_files[0].path == alpha_path + L"\\file");
  assert(ranked_other.largest_files[0].name == L"leader" && ranked_other.largest_files[0].size == large_size + 1);
  assert(files_queried.size() == expected_files.size() + 4);

  opened.clear();
  files_queried.clear();
  rows = scan(root, 1, rules, false, 1000);
  const auto& alpha_files = lookup(rows, L"alpha").largest_files;
  assert(alpha_files.size() == 4 && alpha_files[0].name == L"file" && alpha_files[1].name == L"hard-link");
  assert(alpha_files[0].size == large_size && alpha_files[1].size == large_size);
  assert(alpha_files[2].path == alpha_path + L"\\sub\\nested\\payload" && alpha_files[3].name == L".github");
  const auto& other_files = lookup(rows, L"empty").largest_files;
  assert(other_files.size() == 3 && other_files.back().name == L"zero" && other_files.back().size == 0);
  assert(lookup(rows, L"empty").tree.empty());

  // A non-drive-root scan whose supplied absolute path already exceeds MAX_PATH.
  std::wstring long_root = L"D:\\";
  for (int i = 0; i < 90; ++i) long_root += L"\u76ee\u5f55\\";
  volume = {root_id, {{1, root_id, L"\u6570\u636e"}}};
  const auto child = long_root + L"\u6570\u636e";
  listings = {{long_root, {{L"\u6570\u636e", dir}}}, {child, {{L"f", 0}}}};
  sizes = {{child + L"\\f", 1}};
  rows = scan(long_root, 1, {});
  assert(rows.size() == 1 && rows[0].path == child && rows[0].size == 1);
}
