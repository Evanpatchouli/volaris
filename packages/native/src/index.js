import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

function unavailable(message, cause) {
  return Object.assign(new Error(message, { cause }), { code: "ERR_NTFS_UNAVAILABLE" });
}

export async function scanNtfsMft({ root, depth = 1, ignoreRules = [] }) {
  if (typeof root !== "string" || !root || root.includes("\0")) {
    throw new TypeError("root must be a non-empty directory path");
  }
  if (!Number.isInteger(depth) || depth < 1 || depth > 0xffffffff) {
    throw new RangeError("depth must be a positive 32-bit integer");
  }
  if (!Array.isArray(ignoreRules) || ignoreRules.some(rule => typeof rule !== "string")) {
    throw new TypeError("ignoreRules must be an array of strings");
  }
  if (process.platform !== "win32") {
    throw unavailable("The native NTFS scanner requires Windows");
  }
  const resolved = path.resolve(root);
  if (!/^(?:\\\\\?\\)?[a-z]:\\/i.test(resolved)) {
    throw unavailable("The native NTFS scanner requires a local drive path");
  }

  let binding;
  try {
    binding = require("../cpp/build/Release/volaris_ntfs.node");
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND" && error.code !== "ERR_DLOPEN_FAILED") throw error;
    throw unavailable("Cannot load the native NTFS addon. Run pnpm build:native on Windows.", error);
  }
  return binding.scan(resolved, depth, ignoreRules);
}
