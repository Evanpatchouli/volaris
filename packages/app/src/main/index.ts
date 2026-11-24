import { app, BrowserWindow, dialog, utilityProcess, type IpcMainInvokeEvent, type UtilityProcess } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { channels, type ScanEngine, type ScanEvent } from "../shared/desktop";

function createWindow() {
  const appDir = app.getAppPath();
  const rendererUrl = new URL(
    (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) ||
    pathToFileURL(path.join(appDir, "out/renderer/index.html")).href,
  );
  const scannerPath = app.isPackaged
    ? path.join(process.resourcesPath, "scanner/scan-process.mjs")
    : path.join(appDir, "src/main/scan-process.mjs");
  const win = new BrowserWindow({
    title: "Volaris",
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 580,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(appDir, "out/preload/index.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.removeMenu();
  const contents = win.webContents;
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event) => event.preventDefault());

  let selectedRoot: string | null = null;
  let generation = 0;
  let active: UtilityProcess | null = null;
  let stopping = false;

  function checkSender(event: IpcMainInvokeEvent) {
    const frame = event.senderFrame;
    if (!frame || frame !== contents.mainFrame || frame.url.split("#")[0] !== rendererUrl.href) {
      throw new Error("无法从此页面操作扫描任务。");
    }
  }

  function invalidate() {
    generation++;
    selectedRoot = null;
    const child = active;
    active = null;
    child?.kill();
  }
  contents.on("did-start-loading", invalidate);
  contents.on("render-process-gone", invalidate);
  win.on("closed", invalidate);

  contents.ipc.handle(channels.choose, async (event) => {
    checkSender(event);
    const current = generation;
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: "选择扫描目录",
      properties: ["openDirectory"],
    });
    if (current !== generation || canceled || !filePaths[0]) return null;
    selectedRoot = filePaths[0];
    return selectedRoot;
  });

  contents.ipc.handle(channels.start, (event, root: unknown, engine: ScanEngine) => {
    checkSender(event);
    if (typeof root !== "string" || root !== selectedRoot) throw new Error("请先选择扫描目录。");
    if (engine !== "auto" && engine !== "workers" && engine !== "native") {
      throw new Error("未知的扫描引擎。");
    }
    if (active) throw new Error("已有扫描正在进行。");

    const child = utilityProcess.fork(scannerPath, [], { serviceName: "Volaris Scanner" });
    active = child;
    stopping = false;
    // Keep the terminal event until exit so a subsequent scan always owns a fresh process.
    let terminal: Exclude<ScanEvent, { type: "progress" }> | undefined;
    child.once("spawn", () => {
      if (active !== child || stopping) child.kill();
      else child.postMessage({ root, engine });
    });
    child.on("message", (message: ScanEvent) => {
      if (active !== child || stopping || terminal) return;
      if (message.type === "progress") {
        contents.send(channels.event, message);
      } else {
        terminal = message;
        child.kill();
      }
    });
    child.once("exit", (code) => {
      if (active !== child) return;
      active = null;
      const result: ScanEvent = stopping ? { type: "cancelled" } : terminal ??
        { type: "error", message: `扫描进程意外退出（退出码 ${code}）。` };
      contents.send(channels.event, result);
    });
  });

  contents.ipc.handle(channels.cancel, (event) => {
    checkSender(event);
    if (active) {
      stopping = true;
      active.kill();
    }
  });
  void win.loadURL(rendererUrl.href);
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (!BrowserWindow.getAllWindows().length) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
