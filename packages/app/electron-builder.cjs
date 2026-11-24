const { access } = require("node:fs/promises");
const path = require("node:path");

const addon = "cpp/build/Release/volaris_ntfs.node";
const scannerPackages = ["core", "shared", "native"].map((name) => ({
  from: `../${name}`,
  to: `scanner/node_modules/@volaris/${name}`,
  filter: ["package.json", "src/**/*.js", ...(name === "native" ? [addon] : [])],
}));

module.exports = {
  appId: "io.github.evanpatchouli.volaris",
  productName: "Volaris",
  directories: { output: "release" },
  files: ["out/**/*", "package.json"],
  // Physical paths let ESM workers and the native addon resolve without ASAR shims.
  extraResources: [
    { from: "src/main/scan-process.mjs", to: "scanner/scan-process.mjs" },
    ...scannerPackages,
  ],
  beforePack: async () => {
    try {
      await access(path.join(__dirname, "../native", addon));
    } catch (cause) {
      throw new Error("Build the Windows x64 scanner with pnpm build:native before packaging.", { cause });
    }
  },
  npmRebuild: false,
  electronDist: path.dirname(require("electron")),
  win: { target: "nsis" },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    artifactName: "Volaris-${version}-win-${arch}-setup.${ext}",
  },
};
