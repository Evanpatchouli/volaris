{
  "targets": [{
    "target_name": "volaris_ntfs",
    "includes": ["msvc.gypi"],
    "sources": ["addon.cc", "aggregate.cc", "windows_scan.cc"],
    "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
    "defines": ["NAPI_VERSION=8", "NAPI_CPP_EXCEPTIONS"]
  }]
}
