import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const success = "Packaged NTFS addon and Worker scan passed.";

async function checkScanner(unpacked, fixture) {
  const scanner = path.join(unpacked, "resources", "scanner");
  const entry = path.join(scanner, "scan-process.mjs");
  await access(entry);
  const require = createRequire(entry);
  const packages = await realpath(path.join(scanner, "node_modules", "@volaris"));
  // An unpacked build inside the repository can otherwise resolve workspace dependencies.
  for (const name of ["core", "shared", "native"]) {
    const resolved = await realpath(require.resolve(`@volaris/${name}`));
    assert.ok(resolved.startsWith(path.join(packages, name) + path.sep), `Missing packaged @volaris/${name}`);
  }
  const addon = require(path.join(packages, "native/cpp/build/Release/volaris_ntfs.node"));
  assert.equal(typeof addon.scan, "function");

  const { scan } = await import(pathToFileURL(require.resolve("@volaris/core")).href);
  const { results, summary } = await scan({ root: fixture, engine: "workers", workers: 1 });
  assert.equal(summary.engine, "workers");
  assert.equal(results.length, 1);
  assert.equal(results[0].name, "样本");
  assert.equal(summary.fileCount, 2);
  assert.equal(summary.totalSizeBytes, 7);
  assert.equal(summary.errorCount, 0);
  console.log(success);
}

if (process.versions.electron) {
  await checkScanner(process.argv[2], process.argv[3]);
} else {
  const defaultBuild = fileURLToPath(new URL("../release/win-unpacked/", import.meta.url));
  const unpacked = path.resolve(process.argv[2] ?? defaultBuild);
  const executable = path.join(unpacked, "Volaris.exe");
  await access(executable);
  const fixture = await mkdtemp(path.join(os.tmpdir(), "volaris-package-"));
  try {
    const directory = path.join(fixture, "样本");
    await mkdir(directory);
    await writeFile(path.join(directory, "first"), "abc");
    await writeFile(path.join(directory, "second"), "1234");
    const output = execFileSync(executable, [fileURLToPath(import.meta.url), unpacked, fixture], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      encoding: "utf8",
      windowsHide: true,
      timeout: 30_000,
    });
    assert.ok(output.includes(success), "The packaged Electron runtime did not run the scanner check.");
    console.log(success);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}
