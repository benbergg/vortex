// File-system traversal + per-file invocation of the codemod.
//
// Default extensions: .ts / .tsx / .js / .jsx / .mjs / .cjs.
// Skipped paths: node_modules, dist, build, .git, .next, coverage.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { resolve, join, extname } from "node:path";

import { transformSource, type MigrateWarning, type TransformOptions } from "./codemod.js";

export interface FileReport {
  path: string;
  rewrites: number;
  deletions: number;
  warnings: MigrateWarning[];
  changed: boolean;
}

export interface RunSummary {
  filesScanned: number;
  filesChanged: number;
  callsRewritten: number;
  callsDeleted: number;
  callsWarned: number;
  files: FileReport[];
}

export interface RunOptions {
  /** Write changes back to disk. Defaults to false (dry run). */
  write?: boolean;
  /** Comma-separated extensions, e.g. ['.ts','.tsx']. Default: TS/JS family. */
  extensions?: string[];
  /** Directory names to skip (default: node_modules, dist, build, .git, .next, coverage). */
  ignoreDirs?: string[];
  /** Override jscodeshift parser. */
  parser?: TransformOptions["parser"];
  /** Optional progress hook (per file). */
  onFile?: (report: FileReport) => void;
}

const DEFAULT_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"] as const;
const DEFAULT_IGNORE = ["node_modules", "dist", "build", ".git", ".next", "coverage"] as const;

export function migrateFile(filePath: string, opts: RunOptions = {}): FileReport {
  const abs = resolve(filePath);
  const input = readFileSync(abs, "utf8");
  const parser = opts.parser ?? pickParser(abs);
  const result = transformSource(input, { parser });
  if (opts.write && result.changed) {
    writeFileSync(abs, result.source, "utf8");
  }
  return {
    path: abs,
    rewrites: result.rewrites,
    deletions: result.deletions,
    warnings: result.warnings,
    changed: result.changed,
  };
}

export function migrateDirectory(dir: string, opts: RunOptions = {}): RunSummary {
  const exts = new Set((opts.extensions ?? DEFAULT_EXTS).map((e) => e.toLowerCase()));
  const ignore = new Set(opts.ignoreDirs ?? DEFAULT_IGNORE);

  const summary: RunSummary = {
    filesScanned: 0,
    filesChanged: 0,
    callsRewritten: 0,
    callsDeleted: 0,
    callsWarned: 0,
    files: [],
  };

  walk(resolve(dir), exts, ignore, (file) => {
    const report = migrateFile(file, opts);
    summary.filesScanned++;
    if (report.changed) summary.filesChanged++;
    summary.callsRewritten += report.rewrites;
    summary.callsDeleted += report.deletions;
    summary.callsWarned += report.warnings.length;
    if (report.changed || report.warnings.length > 0) {
      summary.files.push(report);
    }
    opts.onFile?.(report);
  });

  return summary;
}

function walk(
  root: string,
  exts: Set<string>,
  ignore: Set<string>,
  visit: (file: string) => void,
): void {
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ignore.has(ent.name)) continue;
        stack.push(full);
      } else if (ent.isFile()) {
        if (exts.has(extname(ent.name).toLowerCase())) visit(full);
      }
    }
  }

  // If `root` is a single file, walk skips it; cover that path.
  try {
    const s = statSync(root);
    if (s.isFile() && exts.has(extname(root).toLowerCase())) visit(root);
  } catch {
    /* root missing — caller will see empty summary */
  }
}

function pickParser(file: string): TransformOptions["parser"] {
  const ext = extname(file).toLowerCase();
  if (ext === ".tsx") return "tsx";
  if (ext === ".ts") return "ts";
  return "babel";
}
