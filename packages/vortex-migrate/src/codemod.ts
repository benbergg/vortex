// jscodeshift codemod core — rewrites v0.5 vortex_* tool calls to v0.6.
//
// Detection: any ObjectExpression literal with both `name: "vortex_..."` and
// `arguments: { ... }` properties is treated as an MCP tools/call payload.
// This covers the SDK forms we ship (`client.callTool({ name, arguments })`,
// `tools.call({...})`, hand-rolled MCP requests) without needing to enumerate
// every API surface — call-site shape is what matters.
//
// Non-literal call sites (variable names, spread arguments, computed keys)
// are reported as warnings: the rewrite would not be safe.

import jscodeshift, { type ObjectExpression, type Property, type ObjectProperty } from "jscodeshift";

import { TOOL_MAP, V06_TOOL_NAMES, type ArgRewrite, type ToolMapEntry } from "./tool-map.js";

export interface MigrateWarning {
  line: number;
  tool: string;
  reason: string;
}

export interface MigrateResult {
  /** Rewritten source. Equal to input when no changes were made. */
  source: string;
  /** Number of call sites we rewrote (renamed) or deleted. */
  rewrites: number;
  /** Number of call sites we deleted entirely (vortex_ping). */
  deletions: number;
  /** Diagnostic notes — partial migrations + warn-only entries + non-literal calls. */
  warnings: MigrateWarning[];
  /** True if `source !== input`. */
  changed: boolean;
}

export interface TransformOptions {
  /** Force a jscodeshift parser. Default: 'tsx' (handles TS/TSX/JS/JSX). */
  parser?: "babel" | "ts" | "tsx" | "flow";
}

type AnyProp = Property | ObjectProperty;

/** Apply the v0.5 → v0.6 codemod to one source string. */
export function transformSource(input: string, opts: TransformOptions = {}): MigrateResult {
  const j = jscodeshift.withParser(opts.parser ?? "tsx");
  const root = j(input);
  let rewrites = 0;
  let deletions = 0;
  const warnings: MigrateWarning[] = [];

  root.find(j.ObjectExpression).forEach((path) => {
    const obj = path.node;
    const props = obj.properties as AnyProp[];

    const nameProp = findProp(props, "name");
    const argsProp = findProp(props, "arguments");
    if (!nameProp || !argsProp) return;

    const line = obj.loc?.start.line ?? 0;
    const nameVal = stringLiteralValue((nameProp as AnyProp & { value: unknown }).value);

    if (nameVal == null) {
      // Indirect call: { name: someVar, arguments: {...} }. spec §2.3 asks
      // us to warn so the operator can review by hand. We only flag when the
      // payload looks MCP-shaped (arguments is an object literal) so generic
      // `{ name, arguments }` data is left alone.
      if (j.ObjectExpression.check((argsProp as AnyProp & { value: unknown }).value)) {
        const ident = (nameProp as AnyProp & { value: unknown }).value as { type?: string; name?: string };
        const hint = ident?.type === "Identifier" && ident.name ? ` (\`${ident.name}\`)` : "";
        warnings.push({
          line,
          tool: "<indirect>",
          reason: `tool name is not a string literal${hint}; cannot auto-migrate — replace with a literal v0.6 tool name`,
        });
      }
      return;
    }

    if (V06_TOOL_NAMES.has(nameVal)) return; // already on v0.6
    const entry = TOOL_MAP[nameVal];
    if (!entry) return; // unknown — leave alone

    if (entry.v06 === "__DELETE__") {
      const removed = removeEnclosingCallStatement(j, path);
      if (removed) {
        deletions++;
        rewrites++;
        if (entry.warnReason)
          warnings.push({ line, tool: nameVal, reason: entry.warnReason });
      } else {
        warnings.push({
          line,
          tool: nameVal,
          reason: `${nameVal}: cannot safely delete in this expression context — remove manually`,
        });
      }
      return;
    }

    if (entry.v06 == null) {
      warnings.push({
        line,
        tool: nameVal,
        reason: entry.warnReason ?? `${nameVal}: no automatic migration available`,
      });
      return;
    }

    // Skip kept-name entries that have no rewrites — they're already on v0.6.
    const isNoop = entry.v06 === nameVal && (entry.rewrites?.length ?? 0) === 0;
    if (isNoop) return;

    setStringLiteral(j, nameProp, entry.v06);

    const argsValue = (argsProp as AnyProp & { value: unknown }).value;
    if (j.ObjectExpression.check(argsValue)) {
      applyRewrites(j, argsValue as ObjectExpression, entry.rewrites ?? []);
    } else {
      warnings.push({
        line,
        tool: nameVal,
        reason: `${nameVal} → ${entry.v06}: arguments is not an object literal; arg shape was not reshaped`,
      });
    }

    if (entry.partial && entry.partialNote) {
      warnings.push({ line, tool: nameVal, reason: `${nameVal} → ${entry.v06}: ${entry.partialNote}` });
    }
    rewrites++;
  });

  // Second pass: positional call form `fn("vortex_X", {...})`. Covers
  // ctx.call("X", {...}) (vortex-bench helpers), tools.call("X", {...}),
  // mcp.call("X", {...}) — any helper that takes (toolName, args) directly.
  // We don't constrain the callee shape: matching arg[0] string literal +
  // arg[1] object literal + TOOL_MAP key is specific enough to avoid
  // unrelated helpers (vortex_* names are namespaced).
  root.find(j.CallExpression).forEach((path) => {
    const node = path.node;
    const args = node.arguments as unknown[];
    if (args.length < 2) return;
    const nameVal = stringLiteralValue(args[0]);
    if (nameVal == null) return;
    if (V06_TOOL_NAMES.has(nameVal)) return;
    const entry = TOOL_MAP[nameVal];
    if (!entry) return;
    const argsNode = args[1] as { type?: string };
    const line = node.loc?.start.line ?? 0;

    if (entry.v06 === "__DELETE__") {
      warnings.push({
        line,
        tool: nameVal,
        reason: `${nameVal}: deletion not auto-applied for ctx.call form — remove the enclosing statement manually`,
      });
      return;
    }

    if (entry.v06 == null) {
      warnings.push({
        line,
        tool: nameVal,
        reason: entry.warnReason ?? `${nameVal}: no automatic migration available`,
      });
      return;
    }

    // Skip noop kept-name entries.
    const isNoop = entry.v06 === nameVal && (entry.rewrites?.length ?? 0) === 0;
    if (isNoop) return;

    // Replace the first arg (string literal) with the new tool name.
    args[0] = j.literal(entry.v06) as never;

    if (j.ObjectExpression.check(argsNode as never)) {
      applyRewrites(j, argsNode as ObjectExpression, entry.rewrites ?? []);
    } else {
      warnings.push({
        line,
        tool: nameVal,
        reason: `${nameVal} → ${entry.v06}: second argument is not an object literal; arg shape was not reshaped`,
      });
    }

    if (entry.partial && entry.partialNote) {
      warnings.push({ line, tool: nameVal, reason: `${nameVal} → ${entry.v06}: ${entry.partialNote}` });
    }
    rewrites++;
  });

  const source = rewrites > 0 ? root.toSource({ quote: "double" } as never) : input;
  return { source, rewrites, deletions, warnings, changed: source !== input };
}

// ── helpers ─────────────────────────────────────────────────────────────

function findProp(props: AnyProp[], key: string): AnyProp | undefined {
  for (const p of props) {
    if (!p || (p.type !== "Property" && p.type !== "ObjectProperty")) continue;
    const k = (p as AnyProp).key as { type?: string; name?: string; value?: unknown };
    if (!k) continue;
    if (k.type === "Identifier" && k.name === key) return p;
    if (
      (k.type === "Literal" || k.type === "StringLiteral") &&
      typeof k.value === "string" &&
      k.value === key
    )
      return p;
  }
  return undefined;
}

function stringLiteralValue(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const n = node as { type?: string; value?: unknown };
  if ((n.type === "Literal" || n.type === "StringLiteral") && typeof n.value === "string") {
    return n.value;
  }
  return null;
}

function setStringLiteral(j: ReturnType<typeof jscodeshift.withParser>, prop: AnyProp, value: string): void {
  // Replace the value with a fresh StringLiteral to keep formatting.
  // Cast through `any` because jscodeshift / babel AST property unions are
  // wide and not worth modelling in this internal helper.
  (prop as { value: unknown }).value = j.literal(value) as never;
}

function applyRewrites(
  j: ReturnType<typeof jscodeshift.withParser>,
  args: ObjectExpression,
  rewrites: ArgRewrite[],
): void {
  for (const rule of rewrites) {
    if (rule.op === "set") {
      upsertProp(j, args, rule.key, rule.value, /*overwrite*/ true);
    } else if (rule.op === "default") {
      upsertProp(j, args, rule.key, rule.value, /*overwrite*/ false);
    } else if (rule.op === "drop") {
      args.properties = (args.properties as AnyProp[]).filter(
        (p) => !propHasKey(p, rule.key),
      ) as typeof args.properties;
    } else if (rule.op === "remap") {
      remapProp(j, args, rule.from, rule.to, rule.valueMap);
    }
  }

  // Sentinel translation: tool-map uses "__INCLUDE_TEXT__" to ask for
  // `include: ['text']` (array literal). Materialise the array here.
  for (const p of args.properties as AnyProp[]) {
    const k = (p as AnyProp).key as { name?: string; value?: unknown };
    const v = (p as AnyProp & { value: unknown }).value as { value?: unknown };
    const keyName =
      typeof k.name === "string"
        ? k.name
        : typeof k.value === "string"
          ? (k.value as string)
          : undefined;
    if (
      keyName === "include" &&
      v &&
      typeof v === "object" &&
      (v as { value?: unknown }).value === "__INCLUDE_TEXT__"
    ) {
      (p as { value: unknown }).value = j.arrayExpression([j.literal("text")]) as never;
    }
  }
}

function propHasKey(p: AnyProp, key: string): boolean {
  if (!p || (p.type !== "Property" && p.type !== "ObjectProperty")) return false;
  const k = p.key as { type?: string; name?: string; value?: unknown };
  if (k.type === "Identifier" && k.name === key) return true;
  if (
    (k.type === "Literal" || k.type === "StringLiteral") &&
    typeof k.value === "string" &&
    k.value === key
  )
    return true;
  return false;
}

function upsertProp(
  j: ReturnType<typeof jscodeshift.withParser>,
  args: ObjectExpression,
  key: string,
  value: string | number | boolean | null,
  overwrite: boolean,
): void {
  const existing = (args.properties as AnyProp[]).find((p) => propHasKey(p, key));
  if (existing) {
    if (overwrite) {
      (existing as { value: unknown }).value = j.literal(value) as never;
    }
    return;
  }
  const newProp = j.property("init", j.identifier(key), j.literal(value));
  newProp.shorthand = false;
  // Insert at front so the key reads first (e.g. `action: "click"` before target).
  args.properties = [newProp as unknown as Property, ...(args.properties as AnyProp[])] as typeof args.properties;
}

function remapProp(
  j: ReturnType<typeof jscodeshift.withParser>,
  args: ObjectExpression,
  fromKey: string,
  toKey: string,
  valueMap?: Record<string, string>,
): void {
  const idx = (args.properties as AnyProp[]).findIndex((p) => propHasKey(p, fromKey));
  if (idx < 0) return;
  const prop = (args.properties as AnyProp[])[idx] as AnyProp & { value: unknown };

  // Update key identifier.
  (prop as { key: unknown }).key = j.identifier(toKey) as never;
  (prop as { shorthand?: boolean }).shorthand = false;

  // Optionally remap string literal value.
  if (valueMap) {
    const v = prop.value as { type?: string; value?: unknown };
    if (
      (v?.type === "Literal" || v?.type === "StringLiteral") &&
      typeof v.value === "string" &&
      v.value in valueMap
    ) {
      (prop as { value: unknown }).value = j.literal(valueMap[v.value as string]) as never;
    }
  }

  // If a property with the target key already existed (rare), drop the older one.
  const dupIdx = (args.properties as AnyProp[]).findIndex(
    (p, i) => i !== idx && propHasKey(p, toKey),
  );
  if (dupIdx >= 0) {
    args.properties = (args.properties as AnyProp[]).filter(
      (_, i) => i !== dupIdx,
    ) as typeof args.properties;
  }
}

function removeEnclosingCallStatement(
  j: ReturnType<typeof jscodeshift.withParser>,
  path: { parent?: { node?: { type: string } } | null; parentPath?: unknown },
): boolean {
  // Walk parent chain to find an ExpressionStatement / AwaitExpression-wrapped
  // ExpressionStatement and remove it.
  let p: any = path;
  while (p && p.parent) p = p.parent;
  // Re-walk from start to find a statement-like ancestor.
  let cur: any = (path as any).parent;
  while (cur) {
    const t = cur.node?.type;
    if (t === "ExpressionStatement") {
      j(cur).remove();
      return true;
    }
    cur = cur.parent;
  }
  return false;
}
