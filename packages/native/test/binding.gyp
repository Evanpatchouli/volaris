{
  "targets": [
    {
      "target_name": "windows_scan_test",
      "includes": ["../cpp/msvc.gypi"],
      "type": "executable",
      "win_delay_load_hook": "false",
      "sources": ["windows_scan_test.cc", "../cpp/windows_scan.cc"]
    },
    {
      "target_name": "aggregate_test",
      "includes": ["../cpp/msvc.gypi"],
      "type": "executable",
      "win_delay_load_hook": "false",
      "sources": ["aggregate_test.cc", "../cpp/aggregate.cc"]
    }
  ]
}
