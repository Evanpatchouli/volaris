#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace volaris {

struct Result {
  std::wstring path;
  std::wstring name;
  uint64_t size = 0;
  uint64_t fileCount = 0;
  uint64_t dirCount = 0;
  uint64_t errorCount = 0;
  uint64_t skippedCount = 0;
};

std::vector<Result> scan(const std::wstring& root, unsigned depth,
                         const std::vector<std::wstring>& ignore_rules);

}  // namespace volaris
