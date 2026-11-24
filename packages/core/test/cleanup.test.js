import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getCleanupSuggestions, scan } from "../src/index.js";

const gib = 1024 ** 3;
const root = path.resolve("project");

test("only outermost candidate directories cover files, respecting component boundaries", () => {
  const target = path.join(root, "app");
  const tree = [
    { parent: -1, name: "app", size: 9 * gib },
    { parent: 0, name: ".Cache", size: 3 * gib },
    { parent: 1, name: "child", size: 2 * gib },
    { parent: 2, name: "tmp", size: gib },
    { parent: 0, name: "TEMP", size: 2 * gib },
    { parent: 0, name: ".Cache-archive", size: gib },
    { parent: 0, name: "tmp.old", size: gib },
    { parent: 0, name: "node_modules", size: gib },
    { parent: 0, name: ".ruff_cache", size: 0 },
  ];
  const paths = [
    [".Cache/child/tmp/inside", gib], ["TEMP/inside", 2 * gib],
    [".Cache-archive/first-link", gib], ["tmp.old/second-link", gib], ["small", gib - 1],
  ];
  // Hard links represented by two paths in the largest-file snapshot remain separate suggestions.
  const largestFiles = paths.map(([relative, size]) => ({
    path: path.join(target, relative), name: path.basename(relative), size,
  }));
  const report = { summary: { root }, results: [{ path: target, name: "app", tree }], largestFiles };
  assert.deepEqual(getCleanupSuggestions(report), [
    { path: path.join(target, ".Cache"), name: ".Cache", size: 3 * gib, kind: "cache" },
    { path: path.join(target, "TEMP"), name: "TEMP", size: 2 * gib, kind: "temporary" },
    { ...largestFiles[2], kind: "large-file" },
    { ...largestFiles[3], kind: "large-file" },
  ]);
});

test("scans of a cache root suggest its measured targets and include independent direct files", () => {
  const cacheRoot = path.join(root, ".cache");
  const targets = ["one", "two"].map(name => ({ path: path.join(cacheRoot, name), name, size: 1 }));
  const file = { path: path.join(cacheRoot, "direct"), name: "direct", size: gib };
  const suggestions = getCleanupSuggestions({
    summary: { root: cacheRoot }, results: targets, largestFiles: [file],
  });
  assert.deepEqual(suggestions, [
    { ...file, kind: "large-file" }, ...targets.map(target => ({ ...target, kind: "cache" })),
  ]);
});

test("suggestions use only the scanned tree and preserve the ignored and suggested files", async (t) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "volaris-cleanup-"));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const names = ["__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".parcel-cache", ".cache"];
  for (const name of [...names, "tmp", "cache"]) {
    const dir = path.join(folder, "app", name);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "data"), "sample");
  }
  const report = await scan({ root: folder, includeTree: true, ignoreRules: ["tmp"], workers: 1 });
  const expected = names.sort().map(name => ({
    path: path.join(folder, "app", name), name, size: 6, kind: "cache",
  }));
  assert.deepEqual(getCleanupSuggestions(report), expected);
  for (const name of [...names, "tmp"]) {
    assert.equal(await fs.readFile(path.join(folder, "app", name, "data"), "utf8"), "sample");
  }
});

test("deep flat snapshots can be inspected without recursion", () => {
  const target = path.join(root, "app");
  const tree = [{ parent: -1, name: "app", size: 3 }];
  for (let i = 0; i < 12000; i++) tree.push({ parent: i, name: "x", size: 3 });
  tree.push({ parent: tree.length - 1, name: "tmp", size: 3 });
  const suggestions = getCleanupSuggestions({ summary: { root }, results: [{ path: target, tree }] });
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].path, path.join(target, ("x" + path.sep).repeat(12000), "tmp"));
});
