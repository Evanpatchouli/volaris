import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { scan } from "../src/index.js";
import { LargestFiles } from "../src/largest-files.js";

async function fixture(t) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "volaris-largest-"));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  return folder;
}

test("largest files include every depth and leave target statistics unchanged", async (t) => {
  const folder = await fixture(t);
  const root = path.join(folder, "root");
  const first = path.join(root, "one", "target");
  const second = path.join(root, "two", "target");
  await fs.mkdir(first, { recursive: true });
  await fs.mkdir(second, { recursive: true });
  await fs.mkdir(path.join(root, "one", "ignored"));
  const files = [
    ["direct", 30], ["one/above", 26], ["one/target/Z.bin", 25],
    ["two/target/tie", 25], ["one/target/small", 3], ["two/target/empty", 0],
    ["ignored", 200], ["one/ignored/big", 200], ["one/target/ignored", 200],
  ];
  for (const [name, size] of files) await fs.writeFile(path.join(root, name), Buffer.alloc(size));
  await fs.link(path.join(first, "Z.bin"), path.join(first, "a-hard-link"));
  await fs.symlink(second, path.join(root, "shortcut"), process.platform === "win32" ? "junction" : "dir");
  const options = {
    root: path.relative(process.cwd(), root), workers: 2, depth: 2, ignoreRules: ["ignored"],
    onProgress(event) {
      if (event.type === "target-complete") assert.ok(!("largestFiles" in event.result));
    },
  };
  const plain = await scan(options);
  assert.ok(!("largestFiles" in plain));
  assert.ok(!("largestFileReadErrors" in plain));
  const expected = [
    ["direct", 30], ["one/above", 26], ["one/target/Z.bin", 25],
    ["one/target/a-hard-link", 25], ["two/target/tie", 25], ["one/target/small", 3], ["two/target/empty", 0],
  ].map(([file, size]) => ({ path: path.join(root, file), name: path.basename(file), size }));

  for (const limit of [1, 4, 1000]) {
    const report = await scan({ ...options, largestFilesLimit: limit });
    assert.deepEqual(report.results, plain.results);
    assert.equal(report.summary.totalSizeBytes, 78);
    assert.equal(report.summary.fileCount, 5);
    assert.equal(report.largestFileReadErrors, 0);
    assert.deepEqual(report.largestFiles, expected.slice(0, limit));
  }
  if (process.env.VOLARIS_TEST_REQUIRE_NATIVE === "1") {
    const native = await scan({ ...options, engine: "native", largestFilesLimit: 4 });
    assert.deepEqual(native.largestFiles, expected.slice(0, 4));
    assert.equal(native.largestFileReadErrors, 0);
  }
});

test("shallow read errors are counted even when the scan has no targets", async (t) => {
  const root = await fixture(t);
  const inaccessible = path.join(root, "unreadable");
  await fs.writeFile(inaccessible, "");
  const lstat = fs.lstat.bind(fs);
  t.mock.method(fs, "lstat", async (file, ...options) => {
    if (file === inaccessible) throw Object.assign(new Error("Access denied"), { code: "EACCES" });
    return lstat(file, ...options);
  });
  const report = await scan({ root, workers: 1, largestFilesLimit: 1 });
  assert.deepEqual(report.largestFiles, []);
  assert.equal(report.largestFileReadErrors, 1);
  assert.equal(report.summary.errorCount, 0);
});

test("bounded candidates match a full ranking across a long input with ties", () => {
  const largest = new LargestFiles(31);
  const files = Array.from({ length: 421 }, (_, index) => {
    const name = "file" + index;
    return { path: path.join(os.tmpdir(), name), name, size: (index * 59) % 17 };
  });
  for (const file of files) largest.add(file.path, file.name, file.size);
  const ordered = files.sort((a, b) => b.size - a.size || (a.path < b.path ? -1 : 1));
  assert.deepEqual(largest.sorted(), ordered.slice(0, 31));
});

test("invalid limits reject before scanning", async () => {
  for (const limit of [-1, 1.5, 1001, "10", null]) {
    await assert.rejects(scan({ largestFilesLimit: limit }), /largestFilesLimit/);
  }
});
