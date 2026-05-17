import fs from "node:fs/promises";
import path from "node:path";

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let value = bytes;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }

  return `${value.toFixed(2)} ${units[index]}`;
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";

  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;

  return `${seconds}s`;
}

export function normalizePath(value) {
  return String(value || "")
    .replaceAll("\\", "/")
    .replace(/\/+/g, "/")
    .toLowerCase();
}

export async function loadIgnoreRules(cwd = process.cwd()) {
  const file = path.join(cwd, ".volarisignore");

  try {
    const content = await fs.readFile(file, "utf8");

    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.startsWith("#"));
  } catch {
    return [];
  }
}

export function shouldIgnore(fullPath, rules) {
  const normalized = normalizePath(fullPath);
  const basename = normalizePath(path.basename(fullPath));

  return rules.some((rule) => {
    const normalizedRule = normalizePath(rule);

    return (
      basename === normalizedRule ||
      normalized.includes(`/${normalizedRule}/`) ||
      normalized.endsWith(`/${normalizedRule}`)
    );
  });
}

export function csvEscape(value) {
  const str = String(value ?? "");

  if (/[",\n\r]/.test(str)) {
    return `"${str.replaceAll('"', '""')}"`;
  }

  return str;
}
