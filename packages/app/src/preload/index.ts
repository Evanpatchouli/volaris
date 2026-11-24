import { contextBridge, ipcRenderer } from "electron";
import { channels, type DesktopApi, type MonitorEvent, type ScanEvent } from "../shared/desktop";

const desktop: DesktopApi = {
  minimizeWindow: () => ipcRenderer.invoke(channels.minimize),
  toggleMaximize: () => ipcRenderer.invoke(channels.toggleMaximize),
  isWindowMaximized: () => ipcRenderer.invoke(channels.isMaximized),
  onMaximizedChange(listener) {
    const receive = (_event: Electron.IpcRendererEvent, maximized: boolean) => listener(maximized);
    ipcRenderer.on(channels.maximizedChange, receive);
    return () => ipcRenderer.off(channels.maximizedChange, receive);
  },
  hideToTray: () => ipcRenderer.invoke(channels.hide),
  chooseDirectory: () => ipcRenderer.invoke(channels.choose),
  startScan: (root, engine) => ipcRenderer.invoke(channels.start, root, engine),
  cancelScan: () => ipcRenderer.invoke(channels.cancel),
  onScanEvent(listener) {
    const receive = (_event: Electron.IpcRendererEvent, data: ScanEvent) => listener(data);
    ipcRenderer.on(channels.event, receive);
    return () => ipcRenderer.off(channels.event, receive);
  },
  setMonitoring: (root, enabled) => ipcRenderer.invoke(channels.monitor, root, enabled),
  onMonitorEvent(listener) {
    const receive = (_event: Electron.IpcRendererEvent, data: MonitorEvent) => listener(data);
    ipcRenderer.on(channels.monitorEvent, receive);
    return () => ipcRenderer.off(channels.monitorEvent, receive);
  },
};

contextBridge.exposeInMainWorld("volaris", desktop);
