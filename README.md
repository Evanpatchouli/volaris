# Volaris

Volaris 是一个面向 Windows / NTFS 场景演进的专业磁盘空间分析工具。

当前版本是第二阶段实现：

- Node.js CLI
- `worker_threads` 多线程扫描
- 实时 ETA
- Worker 利用率
- 扫描速度统计
- 最终性能报告
- JSON / CSV 导出
- Monorepo 架构，为后续 Native / GUI 预留扩展空间

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
| `@volaris/native` | 第三阶段预留：NTFS MFT / USN Journal 原生扫描 |
| `@volaris/app` | 第四阶段预留：Electron / Tauri GUI |

## 安装

```bash
pnpm install
```

## 运行

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
| `--top` | `50` | 输出前 N 个目录 |
| `--workers` | `min(cpu, 8)` | Worker 数量 |
| `--format` | `table` | `table` / `json` / `csv` |
| `--out` | 自动生成 | 导出文件路径 |
| `--depth` | `1` | 统计目标深度 |

## 后续演进

### 第三阶段：`@volaris/native`

使用 Rust / C++ Native Addon 调用：

- `CreateFile`
- `DeviceIoControl`
- `FSCTL_ENUM_USN_DATA`
- NTFS MFT / USN Journal

目标是接近 WizTree / Everything 的扫描速度。

### 第四阶段：`@volaris/app`

基于 Electron 或 Tauri 做 GUI：

- TreeMap
- 目录树
- 最大文件分析
- 清理建议
- 实时监控
