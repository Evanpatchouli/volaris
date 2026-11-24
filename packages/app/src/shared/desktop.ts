export type ScanEngine = "auto" | "workers" | "native";
export type ActiveEngine = Exclude<ScanEngine, "auto">;

export interface DirectoryNode {
  parent: number;
  name: string;
  size: number;
}

export interface DirectoryResult {
  path: string;
  name: string;
  size: number;
  fileCount: number;
  dirCount: number;
  errorCount: number;
  skippedCount: number;
  tree?: DirectoryNode[];
}

export interface ScanReport {
  results: DirectoryResult[];
  cleanupSuggestions?: CleanupSuggestion[];
  largestFiles?: Array<{ path: string; name: string; size: number }>;
  largestFileReadErrors?: number;
  summary: {
    root: string;
    engine: ActiveEngine;
    fallbackReason?: string;
    targets: number;
    durationMs: number;
    totalSizeBytes: number;
    fileCount: number;
    dirCount: number;
    errorCount: number;
    skippedCount: number;
  };
}

export interface CleanupSuggestion {
  path: string;
  name: string;
  size: number;
  kind: "cache" | "temporary" | "large-file";
}

export interface ScanProgress {
  type: "progress";
  engine: ActiveEngine;
  completedTargets: number;
  totalTargets: number | null;
  totalSizeBytes: number;
  fileCount: number;
  dirCount: number;
  fallbackReason?: string;
}

export type ScanEvent =
  | ScanProgress
  | { type: "complete"; report: ScanReport }
  | { type: "error"; message: string }
  | { type: "cancelled" };

export interface MonitorChange {
  path: string;
  kind: "change" | "rename";
  time: number;
}

export type MonitorEvent =
  | { type: "ready" | "stopped"; root: string }
  | { type: "changes"; root: string; entries: MonitorChange[]; count: number }
  | { type: "error"; root: string; message: string };

export interface DesktopApi {
  minimizeWindow(): Promise<void>;
  toggleMaximize(): Promise<void>;
  isWindowMaximized(): Promise<boolean>;
  onMaximizedChange(listener: (maximized: boolean) => void): () => void;
  hideToTray(): Promise<void>;
  chooseDirectory(): Promise<string | null>;
  startScan(root: string, engine: ScanEngine): Promise<void>;
  cancelScan(): Promise<void>;
  onScanEvent(listener: (event: ScanEvent) => void): () => void;
  setMonitoring(root: string, enabled: boolean): Promise<void>;
  onMonitorEvent(listener: (event: MonitorEvent) => void): () => void;
}

export const channels = {
  minimize: "window:minimize",
  toggleMaximize: "window:toggle-maximize",
  isMaximized: "window:is-maximized",
  maximizedChange: "window:maximized-change",
  hide: "window:hide-to-tray",
  choose: "scan:choose-directory",
  start: "scan:start",
  cancel: "scan:cancel",
  event: "scan:event",
  monitor: "monitor:set",
  monitorEvent: "monitor:event",
} as const;

declare global {
  interface Window {
    volaris: DesktopApi;
  }
}
