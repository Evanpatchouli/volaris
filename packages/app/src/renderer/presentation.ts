import type { ActiveEngine } from "../shared/desktop";

const units = ["B", "KB", "MB", "GB", "TB", "PB"];
const counts = new Intl.NumberFormat("zh-CN");
const decimals = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });

export function formatSize(bytes: number) {
  if (bytes <= 0) return "0 B";
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return decimals.format(bytes / 1024 ** unit) + " " + units[unit];
}

export function formatCount(count: number) {
  return counts.format(count);
}

export function formatDuration(ms: number) {
  if (ms < 1000) return Math.round(ms) + " ms";
  if (ms < 60_000) return decimals.format(ms / 1000) + " s";
  const seconds = Math.floor(ms / 1000);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((part) => String(part).padStart(2, "0")).join(":");
}

const colors = [
  { fill: "#a1b7ff", dot: "bg-[#a1b7ff]" },
  { fill: "#abdafa", dot: "bg-[#abdafa]" },
  { fill: "#ffda90", dot: "bg-[#ffda90]" },
  { fill: "#b2eaca", dot: "bg-[#b2eaca]" },
  { fill: "#cfbcf7", dot: "bg-[#cfbcf7]" },
  { fill: "#f3b6cb", dot: "bg-[#f3b6cb]" },
  { fill: "#abdeda", dot: "bg-[#abdeda]" },
  { fill: "#c0cbec", dot: "bg-[#c0cbec]" },
];

export const colorFor = (index: number) => colors[index % colors.length];
export const engineName = (engine: ActiveEngine) => engine === "workers" ? "Worker" : "NTFS";

export function explainError(message: string) {
  if (/Win32 (5|1314)\b|elevated terminal/i.test(message)) return "当前权限无法读取 NTFS 卷。";
  if (/cannot load the native|requires windows/i.test(message)) return "当前环境无法加载 NTFS 原生引擎。";
  if (/requires .*NTFS|local drive|local volume/i.test(message)) return "该目录所在的卷不支持原生扫描。";
  return message;
}
