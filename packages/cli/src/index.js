#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { performance } from "node:perf_hooks";
import chalk from "chalk";
import cliProgress from "cli-progress";
import minimist from "minimist";
import { scanWithWorkers } from "@volaris/core";
import {
  csvEscape,
  formatBytes,
  loadIgnoreRules,
} from "@volaris/shared";

const argv = minimist(process.argv.slice(2), {
  string: ["path", "format", "out"],
  number: ["top", "workers", "depth"],
  boolean: ["help"],
  default: {
    path: "D:\\",
    top: 50,
    workers: Math.min(os.cpus().length, 8),
    format: "table",
    depth: 1,
  },
});

if (argv.help) {
  console.log(`
Volaris

Usage:
  volaris --path "D:\\" --top 50 --workers 8 --format table

Options:
  --path      Scan root path, default D:\\
  --top       Show top N directories, default 50
  --workers   Worker count, default min(cpu count, 8)
  --format    table | json | csv, default table
  --out       Output file path for json/csv
  --depth     Target depth, default 1
`);
  process.exit(0);
}

async function exportResult(results, format, out, summary) {
  if (format === "json") {
    const file = out || "volaris-result.json";

    await fs.writeFile(
      file,
      JSON.stringify(
        {
          summary,
          results: results.map((item, index) => ({
            rank: index + 1,
            name: item.name,
            path: item.path,
            sizeBytes: item.size,
            sizeHuman: formatBytes(item.size),
            fileCount: item.fileCount,
            dirCount: item.dirCount,
            errorCount: item.errorCount,
            skippedCount: item.skippedCount,
          })),
        },
        null,
        2,
      ),
      "utf8",
    );

    return file;
  }

  if (format === "csv") {
    const file = out || "volaris-result.csv";

    const csv = [
      "rank,name,path,size_bytes,size_human,file_count,dir_count,error_count,skipped_count",
      ...results.map((item, index) =>
        [
          index + 1,
          csvEscape(item.name),
          csvEscape(item.path),
          item.size,
          csvEscape(formatBytes(item.size)),
          item.fileCount,
          item.dirCount,
          item.errorCount,
          item.skippedCount,
        ].join(","),
      ),
    ].join("\n");

    await fs.writeFile(file, csv, "utf8");

    return file;
  }

  return null;
}

function createProgressBar(total) {
  const bar = new cliProgress.SingleBar({
    format:
      `${chalk.cyan("Scanning")} [{bar}] {percentage}% | {value}/{total} targets | ETA {eta_formatted} | Workers {workers} | {dirsPerSec} dirs/s | {filesPerSec} files/s | {mbPerSec} MB/s`,
    hideCursor: true,
  });

  bar.start(total, 0, {
    workers: "0/0",
    dirsPerSec: "0.00",
    filesPerSec: "0.00",
    mbPerSec: "0.00",
  });

  return bar;
}

async function main() {
  const root = path.resolve(argv.path);
  const ignoreRules = await loadIgnoreRules();

  console.log(chalk.bold("\nVolaris Disk Analyzer\n"));
  console.log(chalk.gray(`Root: ${root}`));
  console.log(chalk.gray(`Workers: ${argv.workers}`));
  console.log(chalk.gray(`Top: ${argv.top}`));
  console.log(chalk.gray(`Depth: ${argv.depth}`));
  console.log(chalk.gray(`Ignore rules: ${ignoreRules.length}\n`));

  let bar = null;
  let timer = null;
  let latestMetrics = null;
  const cliStartedAt = performance.now();

  const { results, summary } = await scanWithWorkers({
    root,
    ignoreRules,
    depth: argv.depth,
    workers: argv.workers,
    onProgress(event) {
      latestMetrics = event.metrics;

      if (!bar && event.targets) {
        bar = createProgressBar(event.targets.length);

        timer = setInterval(() => {
          if (!latestMetrics || !bar) return;

          const elapsedSeconds = Math.max(
            (performance.now() - cliStartedAt) / 1000,
            0.001,
          );

          bar.update(latestMetrics.completedTargets, {
            workers: `${latestMetrics.busyWorkers}/${latestMetrics.totalWorkers}`,
            dirsPerSec: (latestMetrics.dirCount / elapsedSeconds).toFixed(2),
            filesPerSec: (latestMetrics.fileCount / elapsedSeconds).toFixed(2),
            mbPerSec: (latestMetrics.totalSize / 1024 / 1024 / elapsedSeconds).toFixed(2),
          });
        }, 500);
      }

      if (bar && event.type === "target-complete") {
        bar.update(event.metrics.completedTargets, {
          workers: `${event.metrics.busyWorkers}/${event.metrics.totalWorkers}`,
        });
      }
    },
  });

  if (timer) clearInterval(timer);
  if (bar) bar.stop();

  const top = results.slice(0, Number(argv.top));

  console.log(chalk.bold(`\nTop ${top.length} Directories\n`));

  console.table(
    top.map((item, index) => ({
      Rank: index + 1,
      Directory: item.name,
      Size: formatBytes(item.size),
      Files: item.fileCount,
      Dirs: item.dirCount,
      Errors: item.errorCount,
    })),
  );

  const outputFile = await exportResult(top, argv.format, argv.out, summary);

  if (outputFile) {
    console.log(chalk.green(`\nExported: ${outputFile}`));
  }

  console.log(
    chalk.green(`\nScan completed in ${summary.durationHuman}`),
  );

  console.log(chalk.bold("\nPerformance Summary\n"));

  console.table([
    { Metric: "Elapsed", Value: summary.durationHuman },
    { Metric: "Total Size", Value: summary.totalSizeHuman },
    { Metric: "Files", Value: summary.fileCount },
    { Metric: "Directories", Value: summary.dirCount },
    { Metric: "Read Errors", Value: summary.errorCount },
    { Metric: "Skipped", Value: summary.skippedCount },
    { Metric: "Files/sec", Value: summary.filesPerSecond.toFixed(2) },
    { Metric: "Dirs/sec", Value: summary.dirsPerSecond.toFixed(2) },
    { Metric: "MB/sec", Value: summary.megabytesPerSecond.toFixed(2) },
    { Metric: "CPU User", Value: `${summary.cpuUserMs.toFixed(2)} ms` },
    { Metric: "CPU System", Value: `${summary.cpuSystemMs.toFixed(2)} ms` },
    { Metric: "CPU Usage", Value: `${summary.cpuPercent.toFixed(2)}%` },
    { Metric: "RSS Memory", Value: formatBytes(summary.memoryRssBytes) },
    { Metric: "Heap Used", Value: formatBytes(summary.memoryHeapUsedBytes) },
  ]);

  console.log(chalk.gray("Permission/read errors are skipped automatically."));
}

main().catch((error) => {
  console.error(chalk.red(error?.stack || error));
  process.exit(1);
});
