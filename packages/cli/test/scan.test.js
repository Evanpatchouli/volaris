import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const cli = fileURLToPath(new URL("../src/index.js", import.meta.url));

test("CLI engines preserve the ranked export and whole-scan totals", async (t) => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "volaris-cli-"));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  const root = path.join(cwd, "测试");
  const large = path.join(root, "A", "large");
  const small = path.join(root, "B", "small");
  await fs.mkdir(path.join(large, "ignored"), { recursive: true });
  await fs.mkdir(small, { recursive: true });
  await fs.writeFile(path.join(cwd, ".volarisignore"), "ignored\n");
  const data = path.join(large, "data");
  await fs.writeFile(data, "12");
  const otherName = path.join(cwd, "outside-scan");
  await fs.link(data, otherName);
  await fs.writeFile(otherName, "12345");
  await fs.writeFile(path.join(large, "ignored", "data"), "123456789");
  await fs.writeFile(path.join(small, "data"), "12");
  await fs.writeFile(path.join(root, "A", "outside-target"), "1234");

  const args = [cli, "--path", root, "--workers", "1", "--depth", "2", "--top", "1"];
  const readJson = async (name, engineArgs) => {
    const output = path.join(cwd, name + ".json");
    const { stdout } = await run(process.execPath, [
      ...args, ...engineArgs, "--format", "json", "--out", output,
    ], { cwd });
    const { results, summary } = JSON.parse(await fs.readFile(output, "utf8"));
    assert.equal(summary.targets, 2);
    assert.equal(summary.totalSizeBytes, 7);
    assert.equal(summary.fileCount, 2);
    assert.equal(summary.dirCount, 2);
    assert.equal(summary.skippedCount, 1);
    assert.equal(summary.errorCount, 0);
    return { results, summary, stdout };
  };

  const workers = await readJson("workers", []);
  assert.equal(workers.summary.engine, "workers");
  assert.equal(workers.summary.workers, 1);
  assert.deepEqual(workers.results, [{
    rank: 1, name: "large", path: large, sizeBytes: 5, sizeHuman: "5.00 B",
    fileCount: 1, dirCount: 1, errorCount: 0, skippedCount: 1,
  }]);
  const automatic = await readJson("auto", ["--engine", "auto"]);
  if (process.env.VOLARIS_TEST_REQUIRE_NATIVE === "1") {
    assert.equal(automatic.summary.engine, "native", automatic.summary.fallbackReason);
  }
  assert.deepEqual(automatic.results, workers.results);
  if (automatic.summary.engine === "workers") {
    assert.ok(automatic.summary.fallbackReason);
    assert.ok(automatic.stdout.includes(automatic.summary.fallbackReason));
    await assert.rejects(
      run(process.execPath, [...args, "--engine", "native"], { cwd }),
      (error) => error.code === 1 && error.stderr.includes(automatic.summary.fallbackReason),
    );
  } else {
    assert.equal(automatic.summary.engine, "native");
    assert.equal(automatic.summary.workers, 0);
    const native = await readJson("native", ["--engine", "native"]);
    assert.deepEqual(native.results, workers.results);
  }

  const csv = path.join(cwd, "workers.csv");
  await run(process.execPath, [...args, "--engine", "workers", "--format", "csv", "--out", csv], { cwd });
  const [header, row] = (await fs.readFile(csv, "utf8")).split("\n");
  assert.equal(header, "rank,name,path,size_bytes,size_human,file_count,dir_count,error_count,skipped_count");
  assert.ok(row.startsWith("1,large,"));
  assert.ok(row.endsWith(",5,5.00 B,1,1,0,1"));
});
