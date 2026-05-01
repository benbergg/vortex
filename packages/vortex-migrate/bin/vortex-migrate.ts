#!/usr/bin/env node
import { Command } from "commander";

import { migrateDirectory, type RunSummary } from "../src/runner.js";

const program = new Command();

program
  .name("vortex-migrate")
  .description("Codemod that rewrites v0.5 vortex_* MCP tool calls to v0.6 (11 public tools).")
  .argument("<path>", "directory or file to scan")
  .option("--write", "apply changes in place (default: dry run)", false)
  .option("--json", "print machine-readable JSON summary instead of text", false)
  .option(
    "--ext <list>",
    "comma-separated extensions to include (default: .ts,.tsx,.js,.jsx,.mjs,.cjs)",
  )
  .option(
    "--ignore <list>",
    "comma-separated directory names to skip (default: node_modules,dist,build,.git,.next,coverage)",
  )
  .action((path: string, opts: { write?: boolean; json?: boolean; ext?: string; ignore?: string }) => {
    const extensions = opts.ext
      ? opts.ext.split(",").map((s) => (s.startsWith(".") ? s : `.${s}`))
      : undefined;
    const ignoreDirs = opts.ignore ? opts.ignore.split(",") : undefined;

    const summary = migrateDirectory(path, {
      write: opts.write,
      extensions,
      ignoreDirs,
    });

    if (opts.json) {
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    } else {
      printHumanSummary(summary, { write: opts.write ?? false, root: path });
    }

    // Exit non-zero only on hard failures (none here). Warnings are informational.
    process.exit(0);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`vortex-migrate: ${msg}\n`);
  process.exit(1);
});

function printHumanSummary(s: RunSummary, ctx: { write: boolean; root: string }): void {
  const out = process.stdout;
  const mode = ctx.write ? "write" : "dry-run";
  out.write(`vortex-migrate (${mode}) — ${ctx.root}\n`);
  out.write(`  files scanned : ${s.filesScanned}\n`);
  out.write(`  files changed : ${s.filesChanged}\n`);
  out.write(`  calls rewritten: ${s.callsRewritten}${s.callsDeleted > 0 ? ` (${s.callsDeleted} deleted)` : ""}\n`);
  out.write(`  warnings      : ${s.callsWarned}\n`);

  if (s.files.length === 0) {
    out.write("\nNo migrations to perform.\n");
    return;
  }

  out.write("\nPer-file detail:\n");
  for (const f of s.files) {
    const tag = f.changed ? (ctx.write ? "WROTE " : "WOULD ") : "warn  ";
    out.write(`  ${tag} ${f.path}  (rewrites=${f.rewrites}, warnings=${f.warnings.length})\n`);
    for (const w of f.warnings) {
      out.write(`         L${w.line}  [${w.tool}]  ${w.reason}\n`);
    }
  }

  if (!ctx.write && s.filesChanged > 0) {
    out.write(`\nRe-run with --write to apply ${s.filesChanged} file change(s).\n`);
  }
}
