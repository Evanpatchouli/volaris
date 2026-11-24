#include "windows_scan.h"

#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <winioctl.h>

#include <algorithm>
#include <cstddef>
#include <cstring>
#include <cwchar>
#include <limits>

namespace volaris {
namespace {

constexpr char unavailable[] = "ERR_NTFS_UNAVAILABLE";
constexpr char scan_error[] = "ERR_NTFS_SCAN";
constexpr DWORD share_all = FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE;

struct Handle {
  HANDLE value;
  BOOL(WINAPI* close)(HANDLE);

  Handle(HANDLE value, BOOL(WINAPI* close)(HANDLE)) : value(value), close(close) {}
  Handle(const Handle&) = delete;
  Handle& operator=(const Handle&) = delete;
  ~Handle() {
    if (value != INVALID_HANDLE_VALUE) close(value);
  }
};

[[noreturn]] void win32_error(const char* operation, DWORD error, bool capability) {
  std::string message = std::string(operation) + " failed (Win32 " + std::to_string(error) + ")";
  const bool denied = error == ERROR_ACCESS_DENIED || error == ERROR_PRIVILEGE_NOT_HELD;
  const bool unsupported = error == ERROR_INVALID_FUNCTION || error == ERROR_NOT_SUPPORTED ||
                           error == ERROR_JOURNAL_NOT_ACTIVE || error == ERROR_JOURNAL_DELETE_IN_PROGRESS;
  if (capability && denied) message += ". Reading the NTFS volume may require an elevated terminal.";
  throw ScanError(capability && (denied || unsupported) ? unavailable : scan_error, message);
}

bool drive_path(const std::wstring& path, size_t start) {
  if (path.size() < start + 3) return false;
  const auto letter = path[start];
  return ((letter >= L'A' && letter <= L'Z') || (letter >= L'a' && letter <= L'z')) &&
         path[start + 1] == L':' && path[start + 2] == L'\\';
}

std::wstring extended_path(std::wstring path) {
  std::replace(path.begin(), path.end(), L'/', L'\\');
  if (path.find(L'\0') != std::wstring::npos) {
    throw ScanError(scan_error, "Scan path contains a null character.");
  }
  if (drive_path(path, 0)) return L"\\\\?\\" + path;
  if (path.compare(0, 4, L"\\\\?\\") == 0 &&
      (drive_path(path, 4) || _wcsnicmp(path.c_str() + 4, L"Volume{", 7) == 0)) {
    return path;
  }
  throw ScanError(unavailable, "Native scanning requires an absolute local volume path.");
}

// Resolve the volume from the opened directory. A drive letter can contain
// junctions and volume mount points that lead to entirely different volumes.
std::wstring volume_device(HANDLE root) {
  std::wstring path(MAX_PATH, L'\0');
  for (;;) {
    const DWORD length = GetFinalPathNameByHandleW(
        root, path.data(), static_cast<DWORD>(path.size()), VOLUME_NAME_GUID | FILE_NAME_OPENED);
    if (!length) {
      const DWORD error = GetLastError();
      if (error == ERROR_PATH_NOT_FOUND) throw ScanError(unavailable, "The scan root has no local volume GUID.");
      win32_error("Resolving the scan volume", error, true);
    }
    if (length < path.size()) {
      path.resize(length);
      break;
    }
    path.resize(length + 1);
  }
  const auto end = path.find(L"}\\");
  if (path.compare(0, 11, L"\\\\?\\Volume{") != 0 || end == std::wstring::npos) {
    throw ScanError(unavailable, "The scan root has no local volume GUID.");
  }
  return path.substr(0, end + 1);  // A volume handle requires no trailing backslash.
}

}  // namespace

uint64_t append_mft_batch(const unsigned char* bytes, size_t count, uint64_t cursor,
                          std::vector<DirectoryRecord>& directories) {
  uint64_t next;
  if (count < sizeof(next)) throw ScanError(scan_error, "Invalid MFT response size.");
  std::memcpy(&next, bytes, sizeof(next));
  if (next <= cursor) throw ScanError(scan_error, "MFT enumeration did not advance.");
  bytes += sizeof(next);
  count -= sizeof(next);
  // FileNameOffset, rather than sizeof(USN_RECORD), also accommodates V2 minor revisions.
  constexpr size_t header_size = offsetof(USN_RECORD, FileName);
  while (count > 0) {
    USN_RECORD record{};
    if (count < offsetof(USN_RECORD, FileReferenceNumber)) {
      throw ScanError(scan_error, "Truncated USN record header.");
    }
    std::memcpy(&record, bytes, offsetof(USN_RECORD, FileReferenceNumber));
    if (record.MajorVersion != 2) throw ScanError(unavailable, "The volume uses an unsupported USN record version.");
    if (record.RecordLength < header_size || record.RecordLength > count || record.RecordLength % 8 != 0) {
      throw ScanError(scan_error, "Invalid USN record length.");
    }
    std::memcpy(&record, bytes, header_size);
    if (record.FileNameOffset < header_size || record.FileNameOffset % sizeof(wchar_t) != 0 ||
        record.FileNameLength % sizeof(wchar_t) != 0 ||
        static_cast<size_t>(record.FileNameOffset) + record.FileNameLength > record.RecordLength) {
      throw ScanError(scan_error, "Invalid USN file name bounds.");
    }
    if ((record.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) && !(record.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT)) {
      std::wstring name(record.FileNameLength / sizeof(wchar_t), L'\0');
      std::memcpy(name.data(), bytes + record.FileNameOffset, record.FileNameLength);
      directories.push_back({record.FileReferenceNumber, record.ParentFileReferenceNumber, std::move(name)});
    }
    bytes += record.RecordLength;
    count -= record.RecordLength;
  }
  return next;
}

namespace {

void enumerate_mft(HANDLE volume, std::vector<DirectoryRecord>& directories) {
  MFT_ENUM_DATA request{};
  request.HighUsn = std::numeric_limits<USN>::max();
  // New SDKs may alias MFT_ENUM_DATA to V1. Send exactly the V0 layout for V2 records.
  constexpr DWORD request_size = offsetof(MFT_ENUM_DATA, HighUsn) + sizeof(request.HighUsn);
  std::vector<unsigned char> buffer(256 * 1024);
  for (;;) {
    DWORD returned = 0;
    if (!DeviceIoControl(volume, FSCTL_ENUM_USN_DATA, &request, request_size,
                         buffer.data(), static_cast<DWORD>(buffer.size()), &returned, nullptr)) {
      const DWORD error = GetLastError();
      if (error == ERROR_HANDLE_EOF) return;
      win32_error("FSCTL_ENUM_USN_DATA", error, true);
    }
    if (returned > buffer.size()) throw ScanError(scan_error, "Invalid MFT response size.");
    request.StartFileReferenceNumber = append_mft_batch(buffer.data(), returned, request.StartFileReferenceNumber, directories);
  }
}

}  // namespace

VolumeIndex index_volume(const std::wstring& root) {
  const std::wstring path = extended_path(root);
  Handle directory(CreateFileW(path.c_str(), FILE_READ_ATTRIBUTES, share_all, nullptr, OPEN_EXISTING,
                               FILE_FLAG_BACKUP_SEMANTICS, nullptr), CloseHandle);
  if (directory.value == INVALID_HANDLE_VALUE) win32_error("Opening the scan root", GetLastError(), false);

  BY_HANDLE_FILE_INFORMATION info{};
  if (!GetFileInformationByHandle(directory.value, &info)) win32_error("Reading the scan root ID", GetLastError(), true);
  if (!(info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)) throw ScanError(scan_error, "Scan root must be a directory.");

  wchar_t filesystem[MAX_PATH + 1]{};
  if (!GetVolumeInformationByHandleW(directory.value, nullptr, 0, nullptr, nullptr, nullptr, filesystem, MAX_PATH + 1)) {
    win32_error("Checking the scan volume filesystem", GetLastError(), true);
  }
  if (_wcsicmp(filesystem, L"NTFS") != 0) throw ScanError(unavailable, "Native scanning requires an NTFS volume.");

  const auto device = volume_device(directory.value);
  Handle volume(CreateFileW(device.c_str(), GENERIC_READ, share_all, nullptr, OPEN_EXISTING, 0, nullptr), CloseHandle);
  if (volume.value == INVALID_HANDLE_VALUE) win32_error("Opening the NTFS volume", GetLastError(), true);
  VolumeIndex index{(static_cast<uint64_t>(info.nFileIndexHigh) << 32) | info.nFileIndexLow, {}};
  enumerate_mft(volume.value, index.directories);
  return index;
}

bool read_directory(const std::wstring& path, std::vector<Entry>& entries) {
  entries.clear();
  auto pattern = extended_path(path);
  if (pattern.back() != L'\\') pattern += L'\\';
  pattern += L'*';
  WIN32_FIND_DATAW data{};
  Handle search(FindFirstFileExW(pattern.c_str(), FindExInfoBasic, &data, FindExSearchNameMatch,
                                 nullptr, FIND_FIRST_EX_LARGE_FETCH), FindClose);
  if (search.value == INVALID_HANDLE_VALUE) return GetLastError() == ERROR_FILE_NOT_FOUND;
  do {
    if (std::wcscmp(data.cFileName, L".") == 0 || std::wcscmp(data.cFileName, L"..") == 0) continue;
    entries.push_back({data.cFileName, data.dwFileAttributes,
                       (static_cast<uint64_t>(data.nFileSizeHigh) << 32) | data.nFileSizeLow});
  } while (FindNextFileW(search.value, &data));
  if (GetLastError() == ERROR_NO_MORE_FILES) return true;
  entries.clear();
  return false;
}

}  // namespace volaris
