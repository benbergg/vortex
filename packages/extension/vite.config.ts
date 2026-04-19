import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import { readFileSync } from "node:fs";
import manifest from "./manifest.json";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

export default defineConfig({
  plugins: [crx({ manifest })],
  define: {
    __EXTENSION_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
