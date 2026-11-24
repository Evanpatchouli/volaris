import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { watchDirectory } from "../src/index.js";

async function fixture(t) {
  const folder = await fs.promises.mkdtemp(path.join(os.tmpdir(), "volaris-watch-"));
  t.after(() => fs.promises.rm(folder, { recursive: true, force: true }));
  return folder;
}

async function waitFor(find) {
  const deadline = performance.now() + 5000;
  while (performance.now() < deadline) {
    const match = find();
    if (match) return match;
    await delay(20);
  }
  assert.fail("Timed out waiting for the watch event");
}

test("recursive watch reports nested changes, respects root ignore rules and stops", async (t) => {
  const root = await fixture(t);
  const subdir = path.join(root, "nested", "folder");
  const ignored = path.join(root, "nested", "ignored");
  const file = path.join(subdir, "data");
  await fs.promises.mkdir(subdir, { recursive: true });
  await fs.promises.mkdir(ignored);
  await fs.promises.writeFile(file, "before");
  await fs.promises.writeFile(path.join(root, ".volarisignore"), "ignored\n");
  const events = [];
  const stop = await watchDirectory(root, (event) => events.push(event));
  try {
    assert.deepEqual(events, [{ type: "ready", root }]);
    await fs.promises.writeFile(path.join(ignored, "hidden"), "unreported");
    await fs.promises.appendFile(file, "after");
    const relative = path.relative(root, file);
    await waitFor(() => events.find(e => e.entries?.some(entry => entry.path === relative)));
    // The OS may coalesce multiple operations before fs.watch emits its first notification.
    for (const batch of events.slice(1)) {
      assert.equal(batch.type, "changes");
      assert.equal(batch.root, root);
      assert.ok(batch.count >= batch.entries.length);
      for (const entry of batch.entries) {
        assert.ok(!entry.path.split(path.sep).includes("ignored"));
        assert.ok(entry.kind === "rename" || entry.kind === "change");
        assert.ok(Number.isSafeInteger(entry.time) && entry.time > 0);
      }
    }
    stop();
    const afterStop = events.length;
    await fs.promises.appendFile(file, "later");
    await delay(300);
    assert.equal(events.length, afterStop);
  } finally {
    stop();
  }
});

test("continuous notifications flush bounded batches and preserve the raw accepted count", async (t) => {
  const root = await fixture(t);
  const watcher = new EventEmitter();
  let closed = 0;
  watcher.close = () => { closed++; watcher.emit("close"); };
  let notify;
  t.mock.method(fs, "watch", (_root, _options, listener) => {
    notify = listener;
    return watcher;
  });
  let accepted = 0;
  const countsAtFlush = [];
  const events = [];
  const stop = await watchDirectory(root, event => {
    if (event.type === "changes") {
      countsAtFlush.push(accepted);
      accepted = 0;
    }
    events.push(event);
  });
  function send(kind, filename) {
    notify(kind, filename);
    accepted++;
  }
  for (let i = 0; i < 250; i++) send("change", "file-" + i);
  send("rename", "file-249");
  send("change", null);
  notify("change", path.join("..", "outside"));
  const producer = setInterval(() => send("change", "hot"), 20);
  try {
    const batch = await waitFor(() => events.find(event => event.type === "changes"));
    assert.equal(batch.entries.length, 200);
    assert.equal(new Set(batch.entries.map(entry => entry.path)).size, 200);
    assert.ok(batch.entries.some(entry => entry.path === "."));
    assert.ok(batch.entries.some(entry => entry.path === "file-249" && entry.kind === "rename"));
    assert.ok(batch.entries.every(entry => !entry.path.includes("outside")));
    assert.equal(batch.count, countsAtFlush[0]);
    await waitFor(() => events.filter(event => event.type === "changes").length > 1);
    watcher.emit("error", new Error("watch failed"));
    assert.deepEqual(events.at(-1), { type: "error", root, message: "watch failed" });
    assert.equal(closed, 1);
  } finally {
    clearInterval(producer);
    stop();
  }
});

test("a moved or replaced root ends the watch", async (t) => {
  const folder = await fixture(t);
  const root = path.join(folder, "root");
  await fs.promises.mkdir(root);
  const events = [];
  const stop = await watchDirectory(root, event => events.push(event));
  try {
    await fs.promises.rename(root, path.join(folder, "previous-root"));
    await fs.promises.mkdir(root);
    const error = await waitFor(() => events.find(event => event.type === "error"));
    assert.equal(error.root, root);
    assert.ok(error.message);
    assert.equal(events.filter(event => event.type === "error").length, 1);
  } finally {
    stop();
  }
});

test("an empty or non-directory root fails before reporting readiness", async (t) => {
  const folder = await fixture(t);
  const file = path.join(folder, "file");
  await fs.promises.writeFile(file, "");
  const unexpected = () => assert.fail("Unexpected watch event");
  await assert.rejects(watchDirectory("", unexpected), /请选择/);
  await assert.rejects(watchDirectory(file, unexpected), /必须是目录/);
});
