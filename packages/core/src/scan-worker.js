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

  const name = path.basename(root);
  const tree = workerData.includeTree ? [{ parent: -1, name, size: 0 }] : null;
  const nodeStack = tree ? [0] : null;
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    const nodeIndex = nodeStack?.pop();

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

    const sizeBefore = totalSize;
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);

      if (shouldIgnore(fullPath, ignoreRules)) {
        skippedCount++;
        continue;
      }

      try {
        if (entry.isDirectory()) {
          stack.push(fullPath);
          if (tree) {
            nodeStack.push(tree.length);
            tree.push({ parent: nodeIndex, name: entry.name, size: 0 });
          }
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
    if (tree) tree[nodeIndex].size = totalSize - sizeBefore;
  }

  const result = {
    path: root,
    name,
    size: totalSize,
    fileCount,
    dirCount,
    errorCount,
    skippedCount,
  };
  if (tree) {
    // Children are appended after their parents, even if a directory cannot be read.
    for (let index = tree.length - 1; index > 0; index--) {
      const node = tree[index];
      tree[node.parent].size += node.size;
    }
    result.tree = tree;
  }
  return result;
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
