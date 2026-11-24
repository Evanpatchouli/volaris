# @volaris/app

Volaris 的 Windows 桌面工作台。选择磁盘或文件夹并开始扫描后，空间分布图和排名会显示各一级子目录的统计结果。点击色块或排名行可联动选中目录，排名行也支持键盘操作。

窗口右上角提供最小化、最大化／还原和关闭到托盘。关闭窗口后，正在运行的扫描会在后台继续。点击托盘图标或从托盘菜单选择「打开」可恢复窗口，选择「退出」结束程序。引擎菜单支持方向键、Enter 和 Escape。

## 本地开发

桌面开发工具需要 Node.js 22.12 或更高版本。在仓库根目录运行以下命令，启动 Electron、React 和 Tailwind CSS 开发环境。

```powershell
pnpm install
pnpm app:dev
```

扫描任务在独立的 Electron utility process 中调用 `@volaris/core`。界面默认使用自动引擎。原生引擎可用时读取 NTFS，卷访问权限或插件条件不足时使用 Worker 并显示原因。Worker 显示已完成目标数，原生扫描显示当前阶段。扫描期间可以取消任务，随后选择目录或重新开始。

扫描从所选目录读取 `.volarisignore`。总大小为各一级子目录下文件逻辑大小之和，根目录直属文件不参与排名。文件占用为零的目录仍出现在列表中。

分析结果中的「目录树」支持逐层展开。每行显示该目录及其后代的逻辑大小。目录树来自本次扫描的快照，展开时可立即查看子目录。

「最大文件」按逻辑大小列出扫描根中的前 100 个文件，包含根目录直属文件。硬链接按路径列出，点选完整路径文本可复制。

## 构建 Windows x64 安装包

Windows x64 打包使用 Python、Visual Studio C++ 工具链和基于 OpenSSL 的 `osslsigncode`。将 `osslsigncode.exe` 加入 PATH，或在 `VOLARIS_OSSLSIGNCODE` 中指定可执行文件的绝对路径。本项目使用 osslsigncode 2.16 验证签名流程。[原生插件构建说明](../native/README.md) · [osslsigncode 官方发行包](https://github.com/mtrojnar/osslsigncode/releases)

### 本地开发签名

在仓库根目录运行以下命令。`app:dist:dev` 使用 PATH 或 Git for Windows 附带的 OpenSSL 为本次构建生成有效期 30 天的自签证书。签名完成后，公有证书保存在 `packages/app/release/volaris-development.pem`，临时私钥随构建结束清除。普通 Windows 安装默认会将此开发身份显示为不受信任。

```powershell
pnpm build:native
pnpm app:dist:dev
node packages/app/scripts/check-package.mjs
```

安装程序位于 `packages/app/release/`，同目录下的 `win-unpacked/Volaris.exe` 可直接启动。最后一条命令检查随包的原生插件和 Worker 扫描结果。可用本次构建的公有证书单独核验安装程序的 Authenticode 签名。

```powershell
$signTool = if ($env:VOLARIS_OSSLSIGNCODE) { $env:VOLARIS_OSSLSIGNCODE } else { "osslsigncode" }
$appVersion = node -p "require('./packages/app/package.json').version"
$installer = Get-Item "packages/app/release/Volaris-$appVersion-win-x64-setup.exe"
& $signTool verify -CAfile packages/app/release/volaris-development.pem -in $installer.FullName
```

### 使用发布证书

将发布者的代码签名证书、私钥和所需中间证书准备为仓库外的 PKCS#12 文件，再运行 `pnpm app:dist`。此命令通过 Authenticode SHA-256 签署主程序、随包 NTFS 插件、NSIS 卸载程序和安装程序。如需 RFC 3161 时间戳，可将 `VOLARIS_TIMESTAMP_URL` 设为证书服务商提供的时间戳 URL。将 `VOLARIS_SIGN_CA_FILE` 设为可信 CA 证书的 PEM 文件路径，可在打包时逐个验签。使用时间戳时该文件也应包含时间戳服务的信任链。开发构建会自动使用本次生成的公有证书验证。

```powershell
$env:VOLARIS_SIGN_PFX = (Resolve-Path 'D:\certificates\volaris.pfx').Path
$env:VOLARIS_SIGN_PASSWORD = Read-Host 'PKCS#12 密码' -MaskInput
try { pnpm app:dist } finally { Remove-Item Env:VOLARIS_SIGN_PASSWORD }
```

`pnpm app:build` 执行类型检查并构建界面。`pnpm app:pack` 生成免安装目录，配置发布证书时也会签名。扫描脚本、Worker 入口和原生插件部署在 `resources/scanner/`。
