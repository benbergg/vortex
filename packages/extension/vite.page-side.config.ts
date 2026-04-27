// Page-side bundle design reference (PR #2).
// The actual build is executed by scripts/build-page-side.mjs via vite's programmatic API,
// using configFile: false to isolate from the crx plugin (which would enable code-splitting
// and break IIFE output format).
//
// Design constraints:
// - IIFE format: required for chrome.scripting.executeScript({ files }) injection
// - emptyOutDir: false → does not wipe main bundle outputs (dist/manifest.json / dist/src/* etc.)
// - outDir: dist/page-side/ → subdir under shared dist/
// - world: MAIN → bundles attach globals to window.*, consistent with PR #1 pageQuery
// - Each entry built independently (rollup does not support IIFE with multiple inputs)
//
// See: scripts/build-page-side.mjs for runtime implementation.

export {};
