import { app, BrowserWindow, dialog, Menu, Tray, utilityProcess, type IpcMainInvokeEvent, type UtilityProcess } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { channels, type MonitorEvent, type ScanEngine, type ScanEvent } from "../shared/desktop";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

function iconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "icon.ico")
    : path.join(app.getAppPath(), "build/icon.ico");
}

function createWindow() {
  const appDir = app.getAppPath();
  const rendererUrl = new URL(
    (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) ||
    pathToFileURL(path.join(appDir, "out/renderer/index.html")).href,
  );
  const workerDir = app.isPackaged
    ? path.join(process.resourcesPath, "scanner")
    : path.join(appDir, "src/main");
  const win = new BrowserWindow({
    title: "Volaris",
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 580,
    frame: false,
    resizable: true,
    icon: iconPath(),
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
  let monitor: UtilityProcess | null = null;

  function checkSender(event: IpcMainInvokeEvent) {
    const frame = event.senderFrame;
    if (!frame || frame !== contents.mainFrame || frame.url.split("#")[0] !== rendererUrl.href) {
      throw new Error("无法从此页面操作桌面窗口。");
    }
  }

  function stopMonitor() {
    const child = monitor;
    monitor = null;
    child?.kill();
  }

  function invalidate() {
    generation++;
    selectedRoot = null;
    stopMonitor();
    const child = active;
    active = null;
    child?.kill();
  }
  contents.on("did-start-loading", invalidate);
  contents.on("render-process-gone", invalidate);
  win.on("closed", () => {
    invalidate();
    mainWindow = null;
  });
  win.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      win.hide();
    }
  });
  win.on("session-end", () => {
    // Windows can end the session without emitting app's before-quit event.
    quitting = true;
    invalidate();
    app.quit();
  });
  win.on("maximize", () => contents.send(channels.maximizedChange, true));
  win.on("unmaximize", () => contents.send(channels.maximizedChange, false));

  contents.ipc.handle(channels.minimize, (event) => {
    checkSender(event);
    win.minimize();
  });
  contents.ipc.handle(channels.toggleMaximize, (event) => {
    checkSender(event);
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  contents.ipc.handle(channels.isMaximized, (event) => {
    checkSender(event);
    return win.isMaximized();
  });
  contents.ipc.handle(channels.hide, (event) => {
    checkSender(event);
    win.hide();
  });

  contents.ipc.handle(channels.choose, async (event) => {
    checkSender(event);
    const current = generation;
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: "选择扫描目录",
      properties: ["openDirectory"],
    });
    if (current !== generation || canceled || !filePaths[0]) return null;
    if (monitor && selectedRoot !== filePaths[0]) {
      stopMonitor();
      contents.send(channels.monitorEvent, { type: "stopped", root: selectedRoot });
    }
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

    const child = utilityProcess.fork(path.join(workerDir, "scan-process.mjs"), [], { serviceName: "Volaris Scanner" });
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

  contents.ipc.handle(channels.monitor, (event, root: unknown, enabled: unknown) => {
    checkSender(event);
    if (typeof root !== "string" || root !== selectedRoot) throw new Error("请先选择监控目录。");
    if (typeof enabled !== "boolean") throw new Error("监控状态无效。");
    if (!enabled) {
      stopMonitor();
      contents.send(channels.monitorEvent, { type: "stopped", root });
      return;
    }
    if (monitor) return;

    const child = utilityProcess.fork(path.join(workerDir, "watch-process.mjs"), [], { serviceName: "Volaris Monitor" });
    monitor = child;
    child.once("spawn", () => {
      if (monitor === child) child.postMessage({ root });
      else child.kill();
    });
    child.on("message", (message: MonitorEvent) => {
      if (monitor !== child || message.root !== root) return;
      if (message.type === "error") stopMonitor();
      contents.send(channels.monitorEvent, message);
    });
    child.once("exit", (code) => {
      if (monitor !== child) return;
      monitor = null;
      contents.send(channels.monitorEvent, {
        type: "error", root, message: `监控进程意外退出（退出码 ${code}）。`,
      });
    });
  });
  void win.loadURL(rendererUrl.href);
  return win;
}

function showMainWindow() {
  if (quitting) return;
  mainWindow ??= createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showMainWindow);
  app.on("activate", showMainWindow);
  app.on("before-quit", () => { quitting = true; });
  app.on("will-quit", () => {
    tray?.destroy();
    tray = null;
  });
  app.whenReady().then(() => {
    tray = new Tray(iconPath());
    tray.setToolTip("Volaris");
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "打开", click: showMainWindow },
      { type: "separator" },
      { label: "退出", click: () => app.quit() },
    ]));
    tray.on("click", showMainWindow);
    showMainWindow();
  });
}
