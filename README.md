# Volaris

Volaris 是一个面向 Windows / NTFS 场景演进的专业磁盘空间分析工具。

当前版本提供两种扫描引擎。

- 默认的 `workers` 引擎用 Node.js 多线程遍历目录，提供实时 ETA 和 Worker 利用率。
- Windows 上可选 `native` 引擎，通过 NTFS 主文件表（MFT）建立目录索引，后台统计指定目录或整卷的逻辑大小。
- 两种引擎都支持目录排名、深度筛选、忽略规则、性能报告及 JSON / CSV 导出。

## 项目结构

```txt
volaris/
├─ packages/
│  ├─ core/
│  ├─ cli/
│  ├─ native/
│  ├─ shared/
│  └─ app/
```

## 包职责

| 包 | 职责 |
| --- | --- |
| `@volaris/shared` | 通用工具函数，例如格式化、ignore 规则、CSV 转义 |
| `@volaris/core` | 扫描核心、Worker 线程池、任务分发 |
| `@volaris/cli` | 命令行入口 |
| `@volaris/native` | C++ Node-API 插件，读取 NTFS MFT 并统计目录大小 |
| `@volaris/app` | Windows 桌面端，提供空间分布图、目录排名和扫描进度 |

## 安装

```bash
pnpm install
```

## 运行

在 Windows 上启动桌面开发版，选择目录后点击「开始扫描」。点击空间分布图或排名行可以查看对应目录。Windows x64 安装包构建步骤见[桌面端说明](packages/app/README.md)。

```powershell
pnpm app:dev
```

运行 CLI 使用以下命令。

```bash
pnpm start
```

等价于：

```bash
pnpm --filter @volaris/cli start
```

## 扫描 D 盘

```bash
pnpm scan:d
```

或者：

```bash
node packages/cli/src/index.js --path "D:\\" --top 50 --workers 8
```

## 使用 NTFS 原生引擎

在 Windows 上安装 Python 3、Visual Studio 的“使用 C++ 的桌面开发”工作负载及 Windows SDK 后，在仓库根目录编译插件。原生扫描支持本地 NTFS 盘符及其子目录，读取卷通常需要管理员终端。[原生构建与统计说明](packages/native/README.md)

```powershell
pnpm build:native
node packages/cli/src/index.js --path D:\ --engine native --top 50
```

需要在普通终端或不同文件系统上运行同一条命令时，可使用 `--engine auto`。插件缺失、卷权限不足或文件系统不支持时，CLI 会显示原因并使用 `workers`。强制 `native` 时会直接报告错误。性能摘要与 JSON 的 `summary.engine` 记录实际引擎。

## 导出 JSON

```bash
pnpm scan:json
```

## 导出 CSV

```bash
pnpm scan:csv
```

## CLI 参数

```bash
volaris --path "D:\\" --top 50 --workers 8 --format table
```

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `--path` | `D:\` | 扫描根目录 |
| `--engine` | `workers` | `workers` / `native` / `auto` |
| `--top` | `50` | 输出前 N 个目录 |
| `--workers` | `min(cpu, 8)` | `workers` 引擎的线程数 |
| `--format` | `table` | `table` / `json` / `csv` |
| `--out` | 自动生成 | 导出文件路径 |
| `--depth` | `1` | 统计目标深度 |

## 验证

```powershell
pnpm test
pnpm --filter @volaris/native test
```

第一条运行引擎选择和 CLI 导出测试。第二条在 Windows 上编译并运行原生测试。在具备卷读取权限的 NTFS 环境中，先运行 `pnpm build:native`，再设置 `$env:VOLARIS_TEST_REQUIRE_NATIVE = "1"` 运行 `pnpm test`，可强制对照原生与 Worker 的扫描结果。

## 后续演进

第三阶段后续会在相同 NTFS 卷上对照两种引擎的耗时、总字节数和文件数，以接近 WizTree / Everything 的扫描速度为优化目标。

桌面端首版已提供同层目录的 TreeMap 与排名。后续功能包括多层目录树、最大文件分析、清理建议与实时监控。
