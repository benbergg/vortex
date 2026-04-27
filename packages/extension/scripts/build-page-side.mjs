#!/usr/bin/env node
// Build page-side IIFE bundles via vite programmatic API.
// Each entry must be built individually because rollup does not support IIFE with multiple inputs.
// Uses an isolated config (no crx plugin) to avoid code-splitting interference.
// Output: dist/page-side/<name>.js

import { build } from "vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");

const entries = [
  { name: "actionability", entry: "src/page-side/actionability.ts" },
  { name: "fill-reject", entry: "src/page-side/fill-reject.ts" },
  { name: "commit-checkbox-group", entry: "src/page-side/commit-drivers/checkbox-group.ts" },
  { name: "commit-select", entry: "src/page-side/commit-drivers/select.ts" },
];

for (const { name, entry } of entries) {
  console.log(`[page-side] building ${name}...`);
  await build({
    // Use isolated config — do NOT load vite.config.ts (which has crx plugin causing code-splitting)
    configFile: false,
    root: pkgRoot,
    logLevel: "warn",
    build: {
      lib: {
        entry: resolve(pkgRoot, entry),
        formats: ["iife"],
        name: `vortexPageSide_${name.replace(/-/g, "_")}`,
        fileName: () => `page-side/${name}.js`,
      },
      outDir: resolve(pkgRoot, "dist"),
      emptyOutDir: false,
      minify: "esbuild",
      sourcemap: false,
      target: "chrome120",
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
    },
  });
  console.log(`[page-side] built dist/page-side/${name}.js`);
}

console.log("[page-side] all bundles built successfully.");
