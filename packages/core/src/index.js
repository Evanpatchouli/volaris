import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { WorkerPool } from "./worker-pool.js";
import { runEngine } from "./engine.js";
import { LargestFiles } from "./largest-files.js";
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

async function visitTargets(root, targetDepth, ignoreRules, onTarget, ranking) {
  const normalizedDepth = normalizeDepth(targetDepth);
  const stack = [{ dir: root, depth: 0 }];

  while (stack.length > 0) {
    const item = stack.pop();

    if (normalizedDepth > 1 && shouldIgnore(item.dir, ignoreRules)) continue;

    if (item.depth === normalizedDepth) {
      onTarget(item.dir);
      continue;
    }

    let entries;

    try {
      entries = await fs.readdir(item.dir, { withFileTypes: true });
    } catch (error) {
      if (normalizedDepth === 1 && onTarget) throw error;
      if (ranking) ranking.readErrors++;
      continue;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!onTarget && item.depth + 1 === normalizedDepth) continue;
        const dir = path.join(item.dir, entry.name);
        if (normalizedDepth === 1) {
          if (!shouldIgnore(dir, ignoreRules)) onTarget(dir);
        } else {
          stack.push({ dir, depth: item.depth + 1 });
        }
      } else if (ranking && entry.isFile()) {
        const file = path.join(item.dir, entry.name);
        if (shouldIgnore(file, ignoreRules)) continue;
        try {
          const stat = await fs.lstat(file);
          if (stat.isFile()) ranking.files.add(file, entry.name, stat.size);
        } catch {
          ranking.readErrors++;
        }
      }
    }
  }
}

export async function collectTargets(root, targetDepth, ignoreRules, ranking) {
  const results = [];
  await visitTargets(root, targetDepth, ignoreRules, (target) => results.push(target), ranking);
  return results;
}

function mergeTargetFiles(result, ranking) {
  for (const file of result.largestFiles) ranking.files.add(file.path, file.name, file.size);
  delete result.largestFiles;
  ranking.readErrors += result.errorCount;
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

  const targets = await collectTargets(root, depth, ignoreRules, options.ranking);

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
    workerData: {
      ignoreRules, includeTree: options.includeTree === true, largestFilesLimit: options.largestFilesLimit,
    },
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
      if (options.ranking) mergeTargetFiles(result, options.ranking);

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

async function scanNativeTargets({ root, depth, ignoreRules = [], includeTree, largestFilesLimit, ranking }) {
  const { scanNtfsMft } = await import("@volaris/native");
  const rows = await scanNtfsMft({
    root, depth: normalizeDepth(depth), ignoreRules, includeTree: includeTree === true, largestFilesLimit,
  });
  if (ranking) {
    for (const row of rows) mergeTargetFiles(row, ranking);
    // The NTFS engine returns target subtrees. Add only files above that depth.
    await visitTargets(root, depth, ignoreRules, null, ranking);
  }
  return rows;
}

export async function scan(options) {
  const { root, largestFilesLimit = 0 } = options;
  if (!Number.isInteger(largestFilesLimit) || largestFilesLimit < 0 || largestFilesLimit > 1000) {
    throw new RangeError("largestFilesLimit must be an integer from 0 to 1000.");
  }
  const ranking = largestFilesLimit ? { files: new LargestFiles(largestFilesLimit), readErrors: 0 } : null;
  const workers = Number(options.workers ?? Math.min(os.cpus().length, 8));
  const startedAt = performance.mark("volaris-scan-start").startTime;
  const startedCpuUsage = process.cpuUsage();
  const { results, engine, fallbackReason } = await runEngine(
    { ...options, workers, largestFilesLimit, ranking }, scanNativeTargets, scanWorkerTargets,
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

  const report = { results, summary };
  if (ranking) {
    report.largestFiles = ranking.files.sorted();
    report.largestFileReadErrors = ranking.readErrors;
  }
  return report;
}

export function scanWithWorkers(options) {
  return scan({ ...options, engine: "workers" });
}
