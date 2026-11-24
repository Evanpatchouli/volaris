# @volaris/native

用于 Windows 本地 NTFS 卷的 C++ Node-API 插件。调用 `scanNtfsMft` 会在后台线程完成扫描，返回各目标目录的路径、逻辑字节数、文件数、目录数、错误数和跳过数。

传入 `includeTree: true` 可在每个目标的结果中取得 `tree` 数组。每个节点的 `name` 是目录名，`size` 是该目录及其后代的逻辑字节数，`parent` 是父节点的数组下标。下标 0 表示目标目录，其 `parent` 为 -1。空目录和无法读取的目录也会出现在树中。插件在同一次扫描中计算这些数据，默认省略 `tree`。旧版插件收到目录树请求时会返回 `ERR_NTFS_UNAVAILABLE`，可重新构建插件以启用此选项。

## 构建与测试

在仓库根目录运行下列命令。构建使用 Python 3、Visual Studio 的“使用 C++ 的桌面开发”工作负载和 Windows SDK。插件按当前 Node.js 架构编译。常规安装只准备依赖。[node-gyp 的 Windows 构建要求](https://github.com/nodejs/node-gyp#on-windows)

```powershell
pnpm install
pnpm build:native
pnpm --filter @volaris/native test
```

测试使用临时目录验证 Windows 文件读取，使用构造的 USN 记录覆盖异常输入，并验证不同深度的统计结果。在有卷读取权限的终端，测试还会从真实 MFT 找回刚创建的子目录。

## 扫描口径

1. 以只读方式打开指定目录及其所在卷。通过 `FSCTL_ENUM_USN_DATA` 分批枚举 MFT，以 64 位文件引用号建立父子目录索引。扫描子目录也需要先枚举其所在卷。[Microsoft 的 MFT 枚举说明](https://learn.microsoft.com/en-us/windows/win32/api/winioctl/ni-winioctl-fsctl_enum_usn_data)
2. 从指定根目录向下查找到达 `depth` 的目录，对每个目标统计自身及后代。在目标层级之前遇到的文件不计入结果。`.volarisignore` 的匹配项和目录内的重解析点会跳过。
3. 对纳入统计的每个文件按路径读取当前逻辑长度。硬链接的每个名称均计数，压缩和稀疏文件按逻辑长度计量。读取失败计入目标的 `errorCount`。[NTFS 硬链接与目录项大小](https://learn.microsoft.com/en-us/windows/win32/fileio/hard-links-and-junctions)

扫描读取的是活动卷。目录在枚举 MFT 后被移动或新建时，索引和目录项可能无法匹配；目标内的此类目录计入 `skippedCount`。每次调用均重新扫描，当前实现只读枚举 USN 记录。

平台、文件系统、卷权限或插件加载条件不足时，Promise 以 `ERR_NTFS_UNAVAILABLE` 拒绝。根路径错误、损坏的记录和其他扫描故障使用 `ERR_NTFS_SCAN`。Windows 通常要求管理员权限才能直接读取卷。[Windows 卷访问要求](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew#physical-disks-and-volumes)
