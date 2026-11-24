import { watchDirectory } from "@volaris/core";

const port = process.parentPort;
port.once("message", async ({ data: { root } }) => {
  try {
    await watchDirectory(root, (event) => port.postMessage(event));
  } catch (error) {
    port.postMessage({ type: "error", root, message: error instanceof Error ? error.message : String(error) });
  }
});
