import path from "node:path";

const cacheNames = new Set(["__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".parcel-cache", ".cache"]);
const largeFileThreshold = 1024 ** 3;

function directoryKind(name) {
  const lower = name.toLowerCase();
  if (cacheNames.has(lower)) return "cache";
  if (lower === "tmp" || lower === "temp") return "temporary";
  return null;
}

function nodePath(target, tree, index) {
  const parts = [];
  while (index > 0) {
    parts.push(tree[index].name);
    index = tree[index].parent;
  }
  return path.resolve(target, parts.reverse().join(path.sep));
}

function hasSuggestedParent(file, directories) {
  let dir = path.dirname(file);
  for (;;) {
    if (directories.has(dir)) return true;
    const parent = path.dirname(dir);
    if (dir === parent) return false;
    dir = parent;
  }
}

export function getCleanupSuggestions(report) {
  const suggestions = [];
  const directories = new Set();
  const rootKind = directoryKind(path.basename(path.resolve(report.summary.root)));

  for (const target of report.results) {
    const tree = target.tree ?? [target];
    const covered = new Uint8Array(tree.length);
    for (let index = 0; index < tree.length; index++) {
      const node = tree[index];
      if (index > 0 && covered[node.parent]) {
        covered[index] = 1;
        continue;
      }
      const kind = (index === 0 && rootKind) || directoryKind(node.name);
      if (!kind || node.size <= 0) continue;

      const fullPath = nodePath(target.path, tree, index);
      suggestions.push({ path: fullPath, name: node.name, size: node.size, kind });
      directories.add(fullPath);
      covered[index] = 1;
    }
  }

  for (const file of report.largestFiles ?? []) {
    if (file.size < largeFileThreshold || hasSuggestedParent(file.path, directories)) continue;
    suggestions.push({ path: file.path, name: file.name, size: file.size, kind: "large-file" });
  }

  return suggestions.sort((a, b) =>
    b.size - a.size || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
