# Snapshot Ref Hash Binding — Design Spec

> Closes the cross-observe ref silent-rebind footgun documented in v0.7.x backlog (`vortex_observe_auto_fallback.md`).

| Field | Value |
|---|---|
| Issue | #20 |
| Milestone | v0.8 |
| Priority | P0 (协议级 footgun) |
| Sub-project | A of 6 in v0.8 milestone decomposition |
| Approach | 1 — Minimal in-place patch |
| Backward compat | Dual-format (v0.8 accept both, deprecate bare ref in v0.9) |
| Hash format | 4-char lowercase hex from `sha256(snapshotId)` |
| Validation semantics | Strict reject on mismatch (no multi-snapshot store) |
| Estimated effort | ~1 day (impl + tests + bench case) |
| Status | Design approved 2026-05-12 |

## 1. Problem

`vortex_observe` returns refs like `@e34`. Server resolves them through a single module-level `activeSnapshotId` in `mcp/src/server.ts`. Caller running two observes in sequence and re-using a ref from observe 1 silently binds to a different element in observe 2's snapshot — same `e34` slot, possibly entirely different element.

Today, dogfood agents avoid this by always using refs from the most recent observe. The bug is **latent**: it materializes for any caller pattern that holds refs across observe calls (multi-step planning, parallel agents, long-context replay).

SOTA reference: MS playwright-mcp avoids this entirely by issuing a fresh snapshot per tool call. vortex chose a 60s-TTL + activeSnapshotId pattern to save tokens. The cost of staying silent was deferred — this spec collects that debt.

## 2. Goal

Refs carry a short snapshot-bound hash. Caller reusing a ref from a prior observe gets a **structured `STALE_REF` error with a recoverable hint**, not silent misbinding.

Non-goals:
- Multi-snapshot LRU store (store-backed validation rejected in brainstorm).
- Hard switch in v0.8 (dual-format chosen to ease migration of OpenClaw plugin / CLI scripts / external prompts).
- Changes to NM protocol or extension snapshot store (minimal patch).
- Closing Scenario C footgun completely (bare-ref silent rebind remains in v0.8.x; closed in v0.9 when bare-ref is deprecated).

## 3. Architecture

```
caller (LLM)              MCP server               extension
─────────                ──────────                ──────────

vortex_observe() ──────> handle()                 snapshot built
                         ├─ relay to ext  ──────> store {id="s_…"}
                         │                        return result + id
                         │  <──────────────────── 
                         ├─ activeSnapshotId = id
                         ├─ activeSnapshotHash = sha256(id)[0:4]   ← new
                         └─ renderObserveCompact()
                            refOf → `@a3f7:e12`                    ← new prefix
                            
                            ┌── caller receives refs
                            
later:
vortex_act({target:"@a3f7:e12"}) ──> resolveTargetParam(target, activeSnapshotId, activeSnapshotHash)
                                     parseRef → {hash:"a3f7", e:12}
                                     ┌── hash present && hash != activeSnapshotHash
                                     │     → VtxError(STALE_REF, recoverable=true)
                                     ├── legacy bare (no hash):
                                     │     → resolve via activeSnapshotId (compat)
                                     └── else (hash matches):
                                          → resolve normally
```

All changes are confined to `packages/mcp/` plus error code/hint additions in `packages/shared/`. Native Messaging protocol, extension snapshot store, OpenClaw plugin, and relay layer are not modified.

## 4. Components

| # | Component | Location | Responsibility |
|---|---|---|---|
| 1 | `activeSnapshotHash` state | `mcp/src/server.ts` | Module-level `string \| null` alongside existing `activeSnapshotId`; updated after every successful observe via `sha256(snapshotId).slice(0,4)`. Failed observe does not update. |
| 2 | `refOf` hash prefix | `mcp/src/lib/observe-render.ts` | Signature gains `snapshotHash: string \| null` param. Emits `@<hash>:eN` when hash is non-null; emits bare `@eN` only for unit-test fixtures (`hash === null`). |
| 3 | `parseRef` dual-format | `mcp/src/lib/ref-parser.ts` | `REF_RE` updated from `^@(?:f(\d+))?e(\d+)$` to `^@(?:([a-fA-F0-9]{4}):)?(?:f(\d+))?e(\d+)$` (hash prefix is optional and outermost; frame prefix `fN` retained). Returns `{ hash?: string, frameId?: number, index: number }`. Hash is lowercased before return for case-insensitive comparison. |
| 4 | `resolveTargetParam` strict check | `mcp/src/lib/ref-parser.ts` | New signature: `(target, activeSnapshotId, activeSnapshotHash) → ResolvedTargetParam`. Hash mismatch throws `STALE_REF`. Bare ref bypasses strict check. |
| 5 | `STALE_REF` error code + hint | `shared/src/errors.ts` + `errors.hints.ts` | Reuse existing `STALE_REF` code (introduced in v0.6 for frame-stale). Add a snapshot-stale hint variant; mark `recoverable: true`. |

**Dependency direction**:
```
errors.ts ──used by──> ref-parser.ts ──used by──> server.ts (dispatch)
observe-render.ts ──reads hash from──> server.ts
```

## 5. Data flow

### Scenario A — Happy path (fresh ref)

```
1. caller: vortex_observe()
2. MCP: relay → ext → result {snapshotId:"s_1a2b3c4d", elements:[...]}
3. MCP: activeSnapshotId  ← "s_1a2b3c4d"
        activeSnapshotHash ← sha256("s_1a2b3c4d").slice(0,4) = "a3f7"
4. renderObserveCompact(result, "a3f7") → refs: ["@a3f7:e0", "@a3f7:e1", ...]
5. caller: vortex_act({target:"@a3f7:e1", action:"click"})
6. MCP: resolveTargetParam("@a3f7:e1", "s_1a2b3c4d", "a3f7")
        parseRef → {hash:"a3f7", index:1}
        hash matches activeSnapshotHash ✓
7. relay → ext → execute
```

### Scenario B — Stale (cross-observe reuse, the bug we fix)

```
1. caller: vortex_observe() → refs ["@a3f7:e0", ...]
2. caller: vortex_observe() again
3. MCP: new snapshot "s_9z8y7x6w", hash "b2c8"
        activeSnapshotId  ← "s_9z8y7x6w"
        activeSnapshotHash ← "b2c8"
4. caller: vortex_act({target:"@a3f7:e0"})   ← reusing observe-1 ref
5. MCP: resolveTargetParam("@a3f7:e0", "s_9z8y7x6w", "b2c8")
        parseRef → {hash:"a3f7", index:0}
        "a3f7" ≠ "b2c8"
6. throw VtxError(STALE_REF, "Ref bound to expired snapshot",
                  { tabId: ... },
                  { recoverable: true,
                    hint: "Call vortex_observe to refresh the element ref list" })
7. caller receives structured error → calls vortex_observe → retries with fresh ref
```

### Scenario C — Legacy bare ref (dual-format compatibility)

```
1. caller (legacy prompt / OpenClaw plugin not yet migrated):
   vortex_act({target:"@e0"})
2. MCP: resolveTargetParam("@e0", "s_9z8y7x6w", "b2c8")
        parseRef → {hash: undefined, index: 0}
        hash absent → bypass strict check
3. resolve via activeSnapshotId  ← silent rebind possible (v0.8.x accepted footgun)
4. relay → ext → execute
```

**Invariants**:
- `renderObserveCompact` always emits hashed refs in v0.8+ (except null-fixture unit tests).
- `resolveTargetParam` accepts both formats; only hashed refs are strict-checked.
- Scenario C residual footgun is the dual-format design boundary; closed only in v0.9.

## 6. Error handling

### `STALE_REF` payload

```ts
VtxError {
  code: VtxErrorCode.STALE_REF,
  message: "Ref bound to expired snapshot",
  context: { tabId, frameId? },
  hint: "Call vortex_observe to refresh the element ref list",
  recoverable: true,
}
```

### Throw location

Single point: `mcp/src/lib/ref-parser.ts → resolveTargetParam`. All 11 public tools enter dispatch and immediately call `resolveTargetParam` — centralized check, no scatter.

```ts
function resolveTargetParam(
  target: string,
  activeSnapshotId: string | null,
  activeSnapshotHash: string | null,
  ctx: VtxErrorContext, // dispatch passes { tabId, frameId? } from VtxRequest
): ResolvedTargetParam {
  if (!activeSnapshotId) {
    throw vtxError(
      VtxErrorCode.INVALID_PARAMS,
      "No active snapshot — call vortex_observe first",
    );
  }
  const parsed = parseRef(target);
  if (!parsed) {
    throw vtxError(VtxErrorCode.INVALID_PARAMS, `Invalid ref format: ${target}`);
  }
  if (parsed.hash !== undefined && parsed.hash !== activeSnapshotHash) {
    throw vtxError(
      VtxErrorCode.STALE_REF,
      "Ref bound to expired snapshot",
      ctx, // VtxErrorContext: { tabId, frameId? } passed from dispatch caller
      {
        hint: "Call vortex_observe to refresh the element ref list",
        recoverable: true,
      },
    );
  }
  return {
    index: parsed.index,
    snapshotId: activeSnapshotId,
    frameId: parsed.frameId,
  };
}
```

### Boundary cases

| Input | Behavior | Code |
|---|---|---|
| `@a3f7:e12` hash mismatch | strict reject | `STALE_REF` |
| `@a3f7e12` (no colon) | regex fail | `INVALID_PARAMS` |
| `@xy12:e12` (non-hex) | regex fail | `INVALID_PARAMS` |
| `@A3F7:e12` (uppercase) | parser lowercases, compare matches | OK |
| `@e12` (bare ref) | bypass strict check | OK (legacy path) |
| `activeSnapshotId == null` | request observe first | `INVALID_PARAMS` |
| `@a3f7:f3e12` (hash + frame) | strict check on hash, frame passes through | depends on hash match |

### Hash normalization

- MCP emits **lowercase** hex via `crypto.createHash("sha256").update(id).digest("hex").slice(0, 4)`.
- Parser accepts mixed case; lowercases before comparison.
- This tolerates LLM occasionally emitting uppercase without breaking.

### `recoverable: true` semantics

Caller (LLM via MCP client) should:
1. Call `vortex_observe()` to refresh the ref list.
2. Re-locate the intended element by label/text in the new list.
3. Retry the action with the new ref.

The `hint` field gives only step 1 — explicit and atomic. Steps 2-3 are LLM agency and don't belong in machine-readable hints. The hint deliberately omits `expected_hash` / `actual_hash` (noise; LLM cannot act on hex values).

## 7. Testing

### Unit tests (mcp package)

| File | Cases | # |
|---|---|---|
| `mcp/tests/ref-parser.test.ts` (extend) | `parseRef`: `@e12` / `@a3f7:e12` / `@f3e12` / `@a3f7:f3e12` / wrong hash length / non-hex / case-insensitive | 6-8 |
| same | `resolveTargetParam`: hash match / hash mismatch → STALE_REF / bare ref legacy / no activeSnapshot → INVALID_PARAMS | 4 |
| `mcp/tests/observe-render.test.ts` (extend) | `refOf` output: hash="a3f7" emits `@a3f7:eN` / hash=null emits `@eN` (unit fixture) | 2 |
| `mcp/tests/server-snapshot-hash.test.ts` (new) | `activeSnapshotHash` state: updates on observe success / unchanged on observe failure / repeat observe overwrites | 3 |

Total ~15 new unit tests. Current mcp suite is 234/234 pass; target maintains 100%.

### Bench (vortex-bench)

| File | Content |
|---|---|
| `vortex-bench/cases/cross-observe-ref-stale.case.ts` (new) | Playground fixture (any page with interactive elements). Sequence: observe1 → capture ref1 → observe2 (trigger via scroll or DOM mutation to force new snapshot) → act with ref1 → assert `error.code === "STALE_REF"`. |

### Ship-preflight self-check

Run `pnpm ship:preflight --from v0.7.4` after the work lands. Expected:
- Gate 1 `[Unreleased]` empty: PASS (CHANGELOG rolled into v0.8.0 section)
- Gate 2 CHANGELOG paths ⊆ git diff: PASS (entries cover ref-parser/observe-render/server/errors)
- Gate 3 numeric: PASS or WARN (small differences tolerated)
- Gate 4 silent fallback: PASS (no new `?? null` introduced)

### Acceptance criteria (issue #20 verbatim + supplements)

- [x] Unit test: cross-observe ref reuse returns `STALE_REF`, never silently rebinds (ref-parser.test.ts)
- [x] Bench case: two-observe sequence with deliberate ref reuse asserts the error (`cross-observe-ref-stale.case.ts`)
- [x] Supplement 1: Legacy bare ref still works (dual-format compat) — ref-parser.test.ts "legacy" case
- [x] Supplement 2: `STALE_REF` hint literally contains "Call vortex_observe" — hint test
- [x] Supplement 3: mcp suite 234+/234+ pass, no regression

## 8. Out of scope (for #20)

- Closing Scenario C (bare-ref silent rebind) — deferred to v0.9 hard switch
- Modifying NM protocol or extension snapshot store key to include hash — minimal patch principle
- Multi-snapshot LRU store / store-backed validation — rejected in brainstorm
- OpenClaw plugin / relay-layer changes — ref string passes through opaquely
- Subtree-by-ref observe (different issue, future)

## 9. Migration / rollout

- **v0.8.0 ship**: dual-format active. CHANGELOG entry highlights new ref format with example and notes bare-ref is legacy.
- **v0.8.x**: monitor dogfood + downstream caller (OpenClaw plugin) for STALE_REF events. If LLM-side hint chain (STALE_REF → re-observe → retry) works smoothly, proceed to v0.9 hard switch with confidence.
- **v0.9**: bare-ref `@eN` rejected with `INVALID_PARAMS` "ref format deprecated, use @hash:eN from observe". Closes Scenario C footgun.
- **OpenClaw plugin**: needs no immediate change (legacy path still works). When the plugin's user prompts get updated, they naturally adopt the new format via observe output. Optional plugin-side migration helper can be added later if needed.

## 10. Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| LLM ignores STALE_REF hint and loops | Medium | Hint text is explicit single-step ("Call vortex_observe to refresh"). If looping observed in dogfood, tighten hint or add structured `recoverable_action: "vortex_observe"` field. |
| Hash collision in 60s TTL | Negligible | 4-char hex = 65536 keyspace. Realistic snapshot rate ≤ 10/min → collision probability ~10⁻⁴/window. If ever hit, mitigation is to bump to 6-char hex (no API change for callers, parser regex widens). |
| Performance — sha256 per observe | Negligible | sha256 on ~20-char snapshotId ~µs scale; one call per observe. |
| External tests / scripts hard-code `@eN` | Low | Dual-format means existing scripts keep working in v0.8.x. v0.9 deprecation gives a release cycle of warning before reject. |
| Frame-stale STALE_REF (existing) confused with snapshot-stale STALE_REF (new) | Low | Same code, different `message` strings ("iframe detached" vs "Ref bound to expired snapshot") — disambiguated at message level; both are `recoverable: true`. |

## 11. References

- Issue #20 — original problem statement
- v0.7.x backlog memory: `vortex_observe_auto_fallback.md` (cross-observe footgun analysis)
- DESIGN.md §4.3 — error code conventions
- `Knowledge-Library/07-Tech/20260512-vortex-ship-checklist.md` — ship preflight gates
- 2026-05-12 design assessment (single-dogfood + SOTA brief)
