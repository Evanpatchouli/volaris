import assert from "node:assert/strict";
import test from "node:test";
import { runEngine } from "../src/engine.js";

const nativeRows = [{ name: "native result" }];
const workerRows = [{ name: "worker result" }];
const unexpected = () => assert.fail("Unexpected scanner invocation");

test("workers is the default and does not probe the addon", async () => {
  const report = await runEngine({}, unexpected, () => workerRows);
  assert.deepEqual(report, { engine: "workers", results: workerRows });
});

test("auto and native use an available native scanner", async () => {
  for (const engine of ["auto", "native"]) {
    const report = await runEngine({ engine }, () => nativeRows, unexpected);
    assert.deepEqual(report, { engine: "native", results: nativeRows });
  }
});

test("only auto falls back on a native capability error", async () => {
  const error = Object.assign(new Error("Cannot open volume"), { code: "ERR_NTFS_UNAVAILABLE" });
  const fail = () => { throw error; };
  const events = [];
  const auto = await runEngine(
    { engine: "auto", onProgress: (event) => events.push(event) }, fail, () => workerRows,
  );
  assert.deepEqual(auto, { engine: "workers", fallbackReason: error.message, results: workerRows });
  assert.deepEqual(events, [
    { type: "native-start" }, { type: "fallback", reason: error.message },
  ]);
  await assert.rejects(runEngine({ engine: "native" }, fail, unexpected), (thrown) => thrown === error);
});

test("auto preserves native scan errors", async () => {
  const error = Object.assign(new Error("Invalid record"), { code: "ERR_NTFS_SCAN" });
  const fail = () => { throw error; };
  await assert.rejects(runEngine({ engine: "auto" }, fail, unexpected), (thrown) => thrown === error);
});

test("an unknown engine fails before scanning", async () => {
  await assert.rejects(runEngine({ engine: "raw" }, unexpected, unexpected), /Unknown scan engine/);
});
