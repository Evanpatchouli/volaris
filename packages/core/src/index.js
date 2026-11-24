import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { WorkerPool } from "./worker-pool.js";
import { runEngine } from "./engine.js";
import { shouldIgnore, formatBytes, formatDuration } from "@volaris/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizeDepth(value) {
  const depth = Math.max(1, Number(value || 1));
  if (!Number.isInteger(depth) || depth > 0xffffffff) {
    throw new RangeError("depth must be a positive 32-bit integer.");
  }
  return depth;
}

export async function collectTargets(root, targetDepth, ignoreRules) {
  const normalizedDepth = normalizeDepth(targetDepth);
  if (normalizedDepth === 1) {
    const entries = await fs.readdir(root, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(root, entry.name))
      .filter((item) => !shouldIgnore(item, ignoreRules));
  }

  const results = [];
  const stack = [{ dir: root, depth: 0 }];

  while (stack.length > 0) {
    const item = stack.pop();

    if (shouldIgnore(item.dir, ignoreRules)) continue;

    if (item.depth === normalizedDepth) {
      results.push(item.dir);
      continue;
    }

    let entries;

    try {
      entries = await fs.readdir(item.dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      stack.push({
        dir: path.join(item.dir, entry.name),
        depth: item.depth + 1,
      });
    }
  }

  return results;
}

function getCpuUsagePercent(startCpuUsage, durationMs) {
  const cpu = process.cpuUsage(startCpuUsage);
  const usedMs = (cpu.user + cpu.system) / 1000;
  const cpuCount = os.cpus().length;
  const percent = durationMs > 0
    ? (usedMs / (durationMs * cpuCount)) * 100
    : 0;

  return {
    userMs: cpu.user / 1000,
    systemMs: cpu.system / 1000,
    usedMs,
    percent,
  };
}

function addCounts(totals, result) {
  totals.totalSize += result.size;
  totals.fileCount += result.fileCount;
  totals.dirCount += result.dirCount;
  totals.errorCount += result.errorCount;
  totals.skippedCount += result.skippedCount;
  return totals;
}

function emptyCounts() {
  return { totalSize: 0, fileCount: 0, dirCount: 0, errorCount: 0, skippedCount: 0 };
}

async function scanWorkerTargets(options) {
  const {
    root,
    ignoreRules = [],
    depth = 1,
    workers,
    onProgress = () => {},
  } = options;

  const startedAt = performance.now();
  if (!Number.isSafeInteger(workers) || workers <= 0) {
    throw new RangeError("workers must be a positive integer.");
  }

  const targets = await collectTargets(root, depth, ignoreRules);

  const metrics = {
    completedTargets: 0,
    busyWorkers: 0,
    idleWorkers: workers,
    queuedJobs: 0,
    totalWorkers: workers,
    ...emptyCounts(),
  };

  const workerFile = path.join(__dirname, "scan-worker.js");

  const pool = new WorkerPool(workerFile, {
    size: workers,
    workerData: { ignoreRules, includeTree: options.includeTree === true },
    onStateChange(state) {
      metrics.busyWorkers = state.busyWorkers;
      metrics.idleWorkers = state.idleWorkers;
      metrics.queuedJobs = state.queuedJobs;
      metrics.totalWorkers = state.totalWorkers;

      onProgress({
        type: "state",
        targets,
        metrics,
        elapsedMs: performance.now() - startedAt,
      });
    },
  });

  const results = [];

  try {
    const tasks = targets.map(async (target) => {
      const result = await pool.run({ path: target });

      results.push(result);

      metrics.completedTargets++;
      addCounts(metrics, result);

      onProgress({
        type: "target-complete",
        result,
        targets,
        metrics,
        elapsedMs: performance.now() - startedAt,
      });
    });

    await Promise.all(tasks);
  } finally {
    await pool.close();
  }
  return results;
}

async function scanNativeTargets({ root, depth, ignoreRules, includeTree }) {
  const { scanNtfsMft } = await import("@volaris/native");
  return scanNtfsMft({ root, depth: normalizeDepth(depth), ignoreRules, includeTree: includeTree === true });
}

export async function scan(options) {
  const { root } = options;
  const workers = Number(options.workers ?? Math.min(os.cpus().length, 8));
  const startedAt = performance.mark("volaris-scan-start").startTime;
  const startedCpuUsage = process.cpuUsage();
  const { results, engine, fallbackReason } = await runEngine(
    { ...options, workers }, scanNativeTargets, scanWorkerTargets,
  );
  const finishedAt = performance.mark("volaris-scan-end").startTime;
  performance.measure("volaris-scan-total", { start: startedAt, end: finishedAt });
  const durationMs = finishedAt - startedAt;
  const durationSeconds = Math.max(durationMs / 1000, 0.001);

  const memory = process.memoryUsage();
  const cpu = getCpuUsagePercent(startedCpuUsage, durationMs);

  results.sort((a, b) => b.size - a.size);
  const metrics = results.reduce(addCounts, emptyCounts());

  const summary = {
    root,
    engine,
    ...(fallbackReason && { fallbackReason }),
    workers: engine === "workers" ? workers : 0,
    targets: results.length,
    durationMs,
    durationHuman: formatDuration(durationMs),
    totalSizeBytes: metrics.totalSize,
    totalSizeHuman: formatBytes(metrics.totalSize),
    fileCount: metrics.fileCount,
    dirCount: metrics.dirCount,
    errorCount: metrics.errorCount,
    skippedCount: metrics.skippedCount,
    filesPerSecond: metrics.fileCount / durationSeconds,
    dirsPerSecond: metrics.dirCount / durationSeconds,
    megabytesPerSecond: metrics.totalSize / 1024 / 1024 / durationSeconds,
    memoryRssBytes: memory.rss,
    memoryHeapUsedBytes: memory.heapUsed,
    cpuUserMs: cpu.userMs,
    cpuSystemMs: cpu.systemMs,
    cpuPercent: cpu.percent,
  };

  return {
    results,
    summary,
  };
}

export function scanWithWorkers(options) {
  return scan({ ...options, engine: "workers" });
}
