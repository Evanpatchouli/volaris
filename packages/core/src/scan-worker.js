import fs from "node:fs/promises";
import path from "node:path";
import { parentPort, workerData } from "node:worker_threads";
import { shouldIgnore } from "@volaris/shared";

const ignoreRules = workerData.ignoreRules ?? [];

async function scanDirectory(root) {
  let totalSize = 0;
  let fileCount = 0;
  let dirCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();

    if (!current || shouldIgnore(current, ignoreRules)) {
      skippedCount++;
      continue;
    }

    let entries;

    try {
      entries = await fs.readdir(current, { withFileTypes: true });
      dirCount++;
    } catch {
      errorCount++;
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);

      if (shouldIgnore(fullPath, ignoreRules)) {
        skippedCount++;
        continue;
      }

      try {
        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }

        if (entry.isFile()) {
          const stat = await fs.stat(fullPath);
          totalSize += stat.size;
          fileCount++;
          continue;
        }

        skippedCount++;
      } catch {
        errorCount++;
      }
    }
  }

  return {
    path: root,
    name: path.basename(root),
    size: totalSize,
    fileCount,
    dirCount,
    errorCount,
    skippedCount,
  };
}

parentPort.on("message", async (message) => {
  if (message.type !== "scan") return;

  try {
    const result = await scanDirectory(message.path);

    parentPort.postMessage({
      type: "done",
      id: message.id,
      result,
    });
  } catch (error) {
    parentPort.postMessage({
      type: "error",
      id: message.id,
      error: error?.message || String(error),
    });
  }
});
