#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace volaris {

struct TreeNode {
  int64_t parent;
  std::wstring name;
  uint64_t size = 0;
};

struct Result {
  std::wstring path;
  std::wstring name;
  uint64_t size = 0;
  uint64_t fileCount = 0;
  uint64_t dirCount = 0;
  uint64_t errorCount = 0;
  uint64_t skippedCount = 0;
  std::vector<TreeNode> tree{};
};

std::vector<Result> scan(const std::wstring& root, unsigned depth,
                         const std::vector<std::wstring>& ignore_rules, bool include_tree = false);

}  // namespace volaris
