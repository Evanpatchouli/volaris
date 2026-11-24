import { randomBytes } from "node:crypto";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

// Vite's React Refresh preamble is an inline module during development.
const devNonce = randomBytes(18).toString("base64");

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        output: { format: "cjs", entryFileNames: "index.cjs" },
      },
    },
  },
  renderer: {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "volaris-dev-csp",
        apply: "serve",
        config: () => ({ html: { cspNonce: devNonce } }),
        transformIndexHtml: {
          order: "pre",
          handler: (html) => html.replace("script-src 'self'", `script-src 'self' 'nonce-${devNonce}'`),
        },
      },
    ],
  },
});
