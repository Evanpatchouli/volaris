import fs from "node:fs";
import path from "node:path";
import { loadIgnoreRules, shouldIgnore } from "@volaris/shared";

const batchIntervalMs = 200;
const maxBatchPaths = 200;

export async function watchDirectory(root, onEvent) {
  if (typeof root !== "string" || !root) throw new TypeError("请选择要监控的目录。");
  const absoluteRoot = path.resolve(root);
  const initial = await fs.promises.stat(absoluteRoot, { bigint: true });
  if (!initial.isDirectory()) throw new Error("监控路径必须是目录。");
  const ignoreRules = await loadIgnoreRules(absoluteRoot);
  const pending = new Map();
  let count = 0;
  let flushTimer;
  let stopped = false;
  let checkingRoot = false;

  function flush() {
    flushTimer = undefined;
    const batch = { type: "changes", root, entries: [...pending.values()], count };
    pending.clear();
    count = 0;
    onEvent(batch);
  }

  const watcher = fs.watch(absoluteRoot, { recursive: true, encoding: "utf8" }, (kind, filename) => {
    if (stopped) return;
    const fullPath = path.resolve(absoluteRoot, filename || ".");
    const relative = path.relative(absoluteRoot, fullPath) || ".";
    if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) return;
    if (shouldIgnore(fullPath, ignoreRules)) return;

    count++;
    pending.delete(relative);
    pending.set(relative, { path: relative, kind, time: Date.now() });
    if (pending.size > maxBatchPaths) pending.delete(pending.keys().next().value);
    if (!flushTimer) flushTimer = setTimeout(flush, batchIntervalMs);
  });

  // On Windows, moving the watched directory can leave fs.watch silently attached to the old object.
  const rootTimer = setInterval(async () => {
    if (checkingRoot) return;
    checkingRoot = true;
    try {
      const current = await fs.promises.stat(absoluteRoot, { bigint: true });
      if (!current.isDirectory() || current.dev !== initial.dev || current.ino !== initial.ino) {
        fail(new Error("监控目录已移走或被替换。"));
      }
    } catch (error) {
      fail(error);
    } finally {
      checkingRoot = false;
    }
  }, 1000);

  function stop() {
    if (stopped) return;
    stopped = true;
    clearTimeout(flushTimer);
    clearInterval(rootTimer);
    pending.clear();
    watcher.close();
  }

  function fail(error) {
    if (stopped) return;
    stop();
    onEvent({ type: "error", root, message: error.message });
  }

  watcher.on("error", fail);
  watcher.once("close", () => fail(new Error("目录监控已意外结束。")));
  try {
    onEvent({ type: "ready", root });
  } catch (error) {
    stop();
    throw error;
  }
  return stop;
}
