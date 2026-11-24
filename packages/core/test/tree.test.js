import assert from "node:assert/strict";
import { renameSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { scan } from "../src/index.js";

async function fixture(t) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "volaris-tree-"));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  return folder;
}

function subtreeSizes(tree) {
  const paths = [];
  const sizes = {};
  for (const [index, node] of tree.entries()) {
    if (index === 0) assert.equal(node.parent, -1);
    else assert.ok(Number.isInteger(node.parent) && node.parent >= 0 && node.parent < index);
    const key = index === 0 ? node.name : paths[node.parent] + "/" + node.name;
    paths.push(key);
    sizes[key] = node.size;
  }
  return sizes;
}

test("tree details reflect the same scan, including empty directories and ignored entries", async (t) => {
  const folder = await fixture(t);
  const root = path.join(folder, "root");
  const target = path.join(root, "data");
  const child = path.join(target, "子");
  const leaf = path.join(child, "leaf");
  const ignored = path.join(child, "ignored");
  await fs.mkdir(leaf, { recursive: true });
  await fs.mkdir(ignored);
  await fs.mkdir(path.join(target, "empty"));
  await fs.mkdir(path.join(root, "other"));
  await fs.writeFile(path.join(target, "direct"), "a");
  await fs.writeFile(path.join(child, "direct"), "bb");
  await fs.writeFile(path.join(leaf, "direct"), "ccc");
  await fs.writeFile(path.join(ignored, "skip"), "ignored");
  await fs.writeFile(path.join(root, "outside-targets"), "excluded");
  const options = { root, ignoreRules: ["ignored"], workers: 2 };
  const plain = await scan(options);
  const detailed = await scan({ ...options, includeTree: true });
  assert.deepEqual(detailed.results.map(({ tree, ...row }) => row), plain.results);
  assert.deepEqual(subtreeSizes(detailed.results[0].tree), {
    "data": 6, "data/empty": 0, "data/子": 5, "data/子/leaf": 3,
  });
  assert.deepEqual(detailed.results[1].tree, [{ parent: -1, name: "other", size: 0 }]);
  assert.equal(detailed.summary.totalSizeBytes, 6);
  assert.equal(detailed.summary.skippedCount, 1);
});

test("tree collection skips directory links", async (t) => {
  const folder = await fixture(t);
  const root = path.join(folder, "root");
  const target = path.join(root, "target");
  const outside = path.join(folder, "outside");
  await fs.mkdir(target, { recursive: true });
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, "file"), "excluded");
  await fs.symlink(outside, path.join(target, "link"), process.platform === "win32" ? "junction" : "dir");
  const { results: [row] } = await scan({ root, workers: 1, includeTree: true });
  assert.deepEqual(row.tree, [{ parent: -1, name: "target", size: 0 }]);
  assert.equal(row.skippedCount, 1);
});

test("an unreadable target stays in its tree", async (t) => {
  const folder = await fixture(t);
  const root = path.join(folder, "root");
  const vanished = path.join(root, "vanished");
  await fs.mkdir(vanished, { recursive: true });
  let moved = false;
  const { results: [row] } = await scan({
    root, workers: 1, includeTree: true,
    onProgress(event) {
      // Move it after discovery and before dispatch, avoiding permission-dependent ACL fixtures.
      if (!moved && event.type === "state") {
        renameSync(vanished, path.join(folder, "moved"));
        moved = true;
      }
    },
  });
  assert.deepEqual(row.tree, [{ parent: -1, name: "vanished", size: 0 }]);
  assert.equal(row.dirCount, 0);
  assert.equal(row.errorCount, 1);
});
