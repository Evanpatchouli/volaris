# @volaris/app

Volaris 的 Windows 桌面工作台。选择磁盘或文件夹并开始扫描后，空间分布图和排名会显示各一级子目录的统计结果。点击色块或排名行可联动选中目录，排名行也支持键盘操作。

## 本地开发

桌面开发工具需要 Node.js 22.12 或更高版本。在仓库根目录运行以下命令，启动 Electron、React 和 Tailwind CSS 开发环境。

```powershell
pnpm install
pnpm app:dev
```

扫描任务在独立的 Electron utility process 中调用 `@volaris/core`。界面默认使用自动引擎。原生引擎可用时读取 NTFS，卷访问权限或插件条件不足时使用 Worker 并显示原因。Worker 显示已完成目标数，原生扫描显示当前阶段。扫描期间可以取消任务，随后选择目录或重新开始。

扫描从所选目录读取 `.volarisignore`。总大小为各一级子目录下文件逻辑大小之和，根目录直属文件不参与排名。文件占用为零的目录仍出现在列表中。

## 构建 Windows x64 安装包

在 Windows x64 环境准备好 Python 和 Visual Studio C++ 工具链后，在仓库根目录运行以下命令。[原生插件构建说明](../native/README.md)

```powershell
pnpm build:native
pnpm app:dist
node packages/app/scripts/check-package.mjs
```

安装程序位于 `packages/app/release/`，同目录下的 `win-unpacked/Volaris.exe` 可直接启动。`pnpm app:build` 执行类型检查并构建主进程、preload 和界面，`pnpm app:pack` 生成免安装目录。打包时扫描脚本、Worker 入口和原生插件随应用部署至 `resources/scanner/`。

最后一条命令通过打包后的 Electron 加载随包的原生插件，并使用 Worker 扫描临时中文目录，校验文件数和逻辑大小。
