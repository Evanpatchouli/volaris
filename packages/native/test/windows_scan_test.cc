#include "../cpp/windows_scan.h"

#include <windows.h>
#include <winioctl.h>

#include <algorithm>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>

namespace fs = std::filesystem;
using namespace volaris;

namespace {

void require(bool value, const char* message) {
  if (!value) throw std::runtime_error(message);
}

template <typename Function>
void expect_error(const char* code, Function operation) {
  try {
    operation();
  } catch (const ScanError& error) {
    require(error.code == code, error.what());
    return;
  }
  throw std::runtime_error("Expected scan error.");
}

constexpr uint64_t directory_id = 0x002300001234abcdu;
constexpr uint64_t parent_id = 0x001100005678abcdu;
const std::wstring unicode_name = L"\u76ee\u5f55\U0001f680";

void append_record(std::vector<unsigned char>& batch, DWORD attributes, const std::wstring& name) {
  USN_RECORD record{};
  record.MajorVersion = 2;
  record.FileReferenceNumber = directory_id;
  record.ParentFileReferenceNumber = parent_id;
  record.FileAttributes = attributes;
  // Leave room for a future minor revision between the fixed header and the name.
  record.MinorVersion = 1;
  record.FileNameOffset = offsetof(USN_RECORD, FileName) + 4;
  record.FileNameLength = static_cast<WORD>(name.size() * sizeof(wchar_t));
  record.RecordLength = (record.FileNameOffset + record.FileNameLength + 7u) & ~7u;
  const size_t offset = batch.size();
  batch.resize(offset + record.RecordLength);
  std::memcpy(batch.data() + offset, &record, offsetof(USN_RECORD, FileName));
  std::memcpy(batch.data() + offset + record.FileNameOffset, name.data(), record.FileNameLength);
}

void test_mft_batch() {
  const uint64_t next = 19;
  std::vector<unsigned char> batch(sizeof(next));
  std::memcpy(batch.data(), &next, sizeof(next));
  append_record(batch, FILE_ATTRIBUTE_NORMAL, L"file");
  append_record(batch, FILE_ATTRIBUTE_DIRECTORY, unicode_name);
  append_record(batch, FILE_ATTRIBUTE_DIRECTORY | FILE_ATTRIBUTE_REPARSE_POINT, L"junction");
  std::vector<DirectoryRecord> directories;
  require(append_mft_batch(batch.data(), batch.size(), 0, directories) == next, "Wrong MFT cursor.");
  require(directories.size() == 1 && directories[0].id == directory_id &&
          directories[0].parent == parent_id && directories[0].name == unicode_name, "Wrong MFT directory record.");

  expect_error("ERR_NTFS_SCAN", [&] { append_mft_batch(batch.data(), batch.size(), next, directories); });
  expect_error("ERR_NTFS_SCAN", [&] { append_mft_batch(batch.data(), 7, 0, directories); });
  expect_error("ERR_NTFS_SCAN", [&] { append_mft_batch(batch.data(), batch.size() - 1, 0, directories); });
  const size_t first = sizeof(next);
  batch[first + offsetof(USN_RECORD, MajorVersion)] = 3;
  expect_error("ERR_NTFS_UNAVAILABLE", [&] { append_mft_batch(batch.data(), batch.size(), 0, directories); });
  batch[first + offsetof(USN_RECORD, MajorVersion)] = 2;
  batch[first + offsetof(USN_RECORD, FileNameOffset)] = 0;
  expect_error("ERR_NTFS_SCAN", [&] { append_mft_batch(batch.data(), batch.size(), 0, directories); });
}

struct Fixture {
  fs::path root = fs::temp_directory_path() /
      (L"volaris-ntfs-test-" + std::to_wstring(GetCurrentProcessId()) + L"-" + std::to_wstring(GetTickCount64()));
  Fixture() { require(fs::create_directory(root), "Could not create a unique fixture directory."); }
  ~Fixture() {
    std::error_code error;
    fs::remove_all(root, error);
  }
};

void test_volume_io() {
  Fixture fixture;
  const auto root = fixture.root / L"scan";
  fs::create_directories(root / L"empty");
  const auto file = root / unicode_name;
  const auto outside = fixture.root / L"outside-link";
  std::ofstream(file, std::ios::binary) << "abc";
  fs::create_hard_link(file, root / L"link");
  fs::create_hard_link(file, outside);
  std::ofstream(outside, std::ios::binary | std::ios::app) << "123456";

  std::vector<Entry> entries;
  require(read_directory(root.wstring(), entries) && entries.size() == 3, "Wrong directory listing.");
  uint64_t bytes = 0;
  for (const auto& entry : entries) {
    if (entry.name == L"empty") {
      require(entry.attributes & FILE_ATTRIBUTE_DIRECTORY, "Missing directory attribute.");
    } else {
      require(entry.name == unicode_name || entry.name == L"link", "Wrong file name.");
      require(read_file_size((root / entry.name).wstring(), bytes) && bytes == 9, "Stale hard link length.");
    }
  }
  require(read_file_size(outside.wstring(), bytes) && bytes == 9, "Wrong size through the external link.");
  require(!read_file_size((root / L"empty").wstring(), bytes), "Directory counted as a regular file.");
  require(!read_file_size((root / L"gone").wstring(), bytes), "Missing file reported as readable.");
  require(read_directory((root / L"empty").wstring(), entries) && entries.empty(), "Wrong empty listing.");
  require(!read_directory((root / L"gone").wstring(), entries), "Missing directory reported as readable.");

  expect_error("ERR_NTFS_SCAN", [&] { index_volume(file.wstring()); });
  expect_error("ERR_NTFS_SCAN", [&] { index_volume((fixture.root / L"gone").wstring()); });
  expect_error("ERR_NTFS_UNAVAILABLE", [&] { index_volume(L"\\\\server\\share\\dir"); });
  try {
    auto index = index_volume(root.wstring());
    require(std::any_of(index.directories.begin(), index.directories.end(), [&](const DirectoryRecord& item) {
      return item.parent == index.root_id && item.name == L"empty";
    }), "MFT volume index did not find the new child directory by parent ID.");
    std::cout << "Live MFT enumeration passed.\n";
  } catch (const ScanError& error) {
    require(error.code == "ERR_NTFS_UNAVAILABLE", error.what());
    std::cout << "Live MFT unavailable: " << error.what() << '\n';
  }
}

}  // namespace

int main() {
  try {
    test_mft_batch();
    test_volume_io();
    std::cout << "USN records and Windows directory I/O passed.\n";
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
