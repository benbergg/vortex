// Page-side bundle entry collection.
// Each page-side module (actionability / fill-reject / commit-drivers/*) is an independent IIFE bundle,
// compiled by vite.page-side.config.ts to dist/page-side/<name>.js.
// Loaded via chrome.scripting.executeScript({ files: ['page-side/<name>.js'], world: 'MAIN' }).
//
// Note: this file is not a bundle entry; it is a TS type/index doc placeholder.
// Actual entries are defined in vite.page-side.config.ts lib.entry.

export {};
