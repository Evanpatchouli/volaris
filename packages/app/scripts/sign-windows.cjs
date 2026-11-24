const { spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { rename, rm } = require("node:fs/promises");
const path = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");

async function replaceSignedFile(output, input) {
  // Windows can briefly hold a newly written PE open without delete sharing.
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(output, input);
      return;
    } catch (error) {
      if (attempt === 6 || !["EBUSY", "EPERM", "EACCES"].includes(error.code)) throw error;
      await delay(100 * 2 ** attempt);
    }
  }
}

module.exports = async function signWindows({ path: input, hash }) {
  const { VOLARIS_SIGN_PASSWORD: password = "", ...env } = process.env;
  const certificate = env.VOLARIS_SIGN_PFX;
  if (!certificate || !path.isAbsolute(certificate)) {
    throw new Error("Set VOLARIS_SIGN_PFX to the absolute path of your PKCS#12 signing certificate.");
  }
  if (/[\r\n]/.test(password)) throw new Error("The signing password must be a single line.");

  // osslsigncode writes a separate PE. Keep the original intact if signing fails.
  const output = input + "." + randomUUID() + ".signed";
  const args = ["sign", "-pkcs12", certificate, "-readpass", "-", "-h", hash, "-n", "Volaris"];
  if (env.VOLARIS_TIMESTAMP_URL) args.push("-ts", env.VOLARIS_TIMESTAMP_URL);
  args.push("-in", input, "-out", output);
  function run(command, stdin) {
    const result = spawnSync(env.VOLARIS_OSSLSIGNCODE || "osslsigncode", command, {
      env, windowsHide: true, input: stdin, stdio: ["pipe", "inherit", "inherit"],
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error("osslsigncode " + command[0] + " failed for " + path.basename(input));
  }
  try {
    console.log("Signing " + path.basename(input) + " (" + hash + ")");
    run(args, password + "\n");
    if (env.VOLARIS_SIGN_CA_FILE) {
      const trust = ["-CAfile", env.VOLARIS_SIGN_CA_FILE];
      if (env.VOLARIS_TIMESTAMP_URL) trust.push("-TSA-CAfile", env.VOLARIS_SIGN_CA_FILE);
      run(["verify", ...trust, "-in", output]);
    }
    await replaceSignedFile(output, input);
  } finally {
    await rm(output, { force: true });
  }
};
