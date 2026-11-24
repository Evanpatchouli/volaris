import { getCleanupSuggestions, scan } from "@volaris/core";
import { loadIgnoreRules } from "@volaris/shared";

const port = process.parentPort;

port.once("message", async ({ data: { root, engine } }) => {
  let fallbackReason;
  let lastUpdate = -Infinity;
  const publishProgress = (activeEngine, metrics, targets) => {
    port.postMessage({
      type: "progress",
      engine: activeEngine,
      totalTargets: targets?.length ?? null,
      completedTargets: metrics?.completedTargets ?? 0,
      fileCount: metrics?.fileCount ?? 0,
      dirCount: metrics?.dirCount ?? 0,
      totalSizeBytes: metrics?.totalSize ?? 0,
      fallbackReason,
    });
  };
  try {
    if (engine === "workers") publishProgress("workers");
    const ignoreRules = await loadIgnoreRules(root);
    const report = await scan({
      root,
      engine,
      ignoreRules,
      includeTree: true,
      largestFilesLimit: 100,
      onProgress(event) {
        if (event.type === "native-start") {
          publishProgress("native");
        } else if (event.type === "fallback") {
          fallbackReason = event.reason;
          publishProgress("workers");
        } else {
          const now = performance.now();
          if (now - lastUpdate >= 100) {
            lastUpdate = now;
            publishProgress("workers", event.metrics, event.targets);
          }
        }
      },
    });
    report.cleanupSuggestions = getCleanupSuggestions(report);
    port.postMessage({ type: "complete", report });
  } catch (error) {
    port.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
});
