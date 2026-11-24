export async function runEngine(options, scanNative, scanWorkers) {
  const { engine = "workers", onProgress } = options;
  if (engine === "workers") {
    return { engine, results: await scanWorkers(options) };
  }
  if (engine !== "native" && engine !== "auto") {
    throw new RangeError(`Unknown scan engine "${engine}". Use workers, native, or auto.`);
  }

  onProgress?.({ type: "native-start" });
  try {
    const results = await scanNative(options);
    return { engine: "native", results };
  } catch (error) {
    if (engine !== "auto" || error?.code !== "ERR_NTFS_UNAVAILABLE") throw error;
    onProgress?.({ type: "fallback", reason: error.message });
    return { engine: "workers", fallbackReason: error.message, results: await scanWorkers(options) };
  }
}
