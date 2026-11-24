#pragma once

#include <cstddef>
#include <cstdint>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace volaris {

class ScanError : public std::runtime_error {
 public:
  ScanError(std::string code, std::string message)
      : std::runtime_error(std::move(message)), code(std::move(code)) {}
  std::string code;
};

struct DirectoryRecord {
  uint64_t id;
  uint64_t parent;
  std::wstring name;
};

struct VolumeIndex {
  uint64_t root_id;
  std::vector<DirectoryRecord> directories;
};

struct Entry {
  std::wstring name;
  uint32_t attributes;
  uint64_t size;
};

VolumeIndex index_volume(const std::wstring& root);
bool read_directory(const std::wstring& path, std::vector<Entry>& entries);

// Parse one FSCTL_ENUM_USN_DATA output buffer and return its continuation cursor.
uint64_t append_mft_batch(const unsigned char* bytes, std::size_t count, uint64_t cursor,
                          std::vector<DirectoryRecord>& directories);

}  // namespace volaris
