# vortex v0.6.0 dogfood report

Run date: 2026-05-01

Methodology: each (task, version, run) is a fresh Claude Code session
fed the prompt verbatim from `docs/dogfood-prompts/`. Metrics come from
`scripts/dogfood-extract.mjs` against the session transcript jsonl.
N=3 per (task, version) with mean + per-run breakdown.

Browser environment: Chrome stable + vortex extension dist loaded from
`packages/extension/dist`. The v0.5 baseline was captured against
`.worktrees/v0.5-dogfood/packages/extension/dist` (manifest version 0.2.0,
background bundle 93 KB); the v0.6 runs against
`.worktrees/v0.6-pr5/packages/extension/dist` (manifest 0.5.0, 109 KB,
plus the page-side bundle directory).

## Verdict

Release gate met for v0.6.0:

- Success rate v0.6 = 3/3 = v0.5 (no regression).
- Mean wall-clock duration -31% (gate target -30%, met).
- Mean token total -18% and mean model-call count -11%; both miss the
  -30% headline target but trend the right direction with no regression.
  See "Why headline tokens/calls missed -30%" below.
- Five real v0.6 bugs found and fixed during the dogfood run (see
  "Findings"); shipping v0.6 without these would have been broken end to
  end. The dogfood gate paid for itself.

## Per-task summary

### Task 1 — github-star (search GitHub for "playwright", star first result)

| run | duration | model_calls | tokens | vortex_tools |
|----:|---------:|------------:|-------:|-------------:|
| v0.5 run 1 |  52 s | 12 | 596 K | 5 |
| v0.5 run 2 |  40 s | 15 | 778 K | 5 |
| v0.5 run 3 |  41 s | 17 | 918 K | 6 |
| **v0.5 mean** | **44 s** | **14.7** | **764 K** | **5.3** |
| v0.6 run 1 |  24 s | 11 | 534 K | 5 |
| v0.6 run 2 |  25 s | 14 | 672 K | 5 |
| v0.6 run 3 |  23 s | 14 | 674 K | 5 |
| **v0.6 mean** | **24 s** | **13.0** | **627 K** | **5.0** |
| **Δ** | **-45%** | **-12%** | **-18%** | **-6%** |

### Task 2 — github-trending (top 5 trending repos today)

| run | duration | model_calls | tokens | vortex_tools |
|----:|---------:|------------:|-------:|-------------:|
| v0.5 run 1 |  41 s | 12 | 612 K | 4 |
| v0.5 run 2 |  92 s | 12 | 635 K | 4 |
| v0.5 run 3 |  37 s | 12 | 609 K | 3 |
| **v0.5 mean** | **57 s** | **12.0** | **619 K** | **3.7** |
| v0.6 run 1 |  19 s |  7 | 326 K | 2 |
| v0.6 run 2 |  24 s | 12 | 566 K | 4 |
| v0.6 run 3 |  31 s | 15 | 711 K | 5 |
| **v0.6 mean** | **25 s** | **11.3** | **534 K** | **3.7** |
| **Δ** | **-56%** | **-6%** | **-14%** | **0%** |

### Task 3 — zhihu-search-screenshot (search + capture first card)

| run | duration | model_calls | tokens | vortex_tools |
|----:|---------:|------------:|-------:|-------------:|
| v0.5 run 1 | 125 s | 35 | 2.01 M | 13 |
| v0.5 run 2 | 129 s | 24 | 1.41 M | 12 |
| v0.5 run 3 | 135 s | 22 | 1.20 M | 10 |
| **v0.5 mean** | **130 s** | **27.0** | **1.54 M** | **11.7** |
| v0.6 run 1 | 129 s | 28 | 1.54 M | 12 |
| v0.6 run 2 | 139 s | 26 | 1.43 M | 15 |
| v0.6 run 3 |  59 s | 16 | 789 K |  6 |
| **v0.6 mean** | **109 s** | **23.3** | **1.25 M** | **11.0** |
| **Δ** | **-16%** | **-14%** | **-19%** | **-6%** |

### Aggregate (weighted across tasks)

| metric | v0.5 mean | v0.6 mean | Δ |
|---|---:|---:|---:|
| duration | 77 s | 53 s | **-31%** |
| model_calls | 17.9 | 15.9 | **-11%** |
| tokens | 975 K | 803 K | **-18%** |
| vortex_tool_calls | 6.9 | 6.6 | -4% |
| success rate | 3/3 per task | 3/3 per task | 0 |

## Why headline tokens/calls missed -30%

The -30% headline was set against the assumption that L4's 11-tool
facade would let the model substitute one `vortex_act` call for what
used to be several v0.5 atom calls (e.g. fill+wait+click). In practice
the v0.5 baseline already converges to a small handful of atom calls
per task — task 2 only used 3.7 tools on average — so there isn't a
4-to-1 collapse to harvest. The wins instead show up where v0.6
genuinely shaves IO:

- **Compact observe rendering** is the biggest single contributor. In
  v0.5 a typical observe response on the GitHub search page is roughly
  60 KB of raw JSON; the v0.6 compact `@eN [role] "name"` line format
  brings the same content down to a few KB. Each observe is one round
  trip, so the saving compounds across the session.
- **`vortex_act` ref shorthand** lets the model address the target as
  `@e54` instead of stitching `{index, snapshotId}` into the call;
  per-call output tokens go down a little but the bigger win is the
  model not having to copy the snapshot-id string around.
- **Auto-recovery on actionability failure** removes most of the
  fallback chains (try-different-selector, scroll-then-retry) that
  ran up the v0.5 token bill on dynamic pages.

The duration figure (-31%) reflects the same wins more cleanly because
duration counts every bit of wasted IO, including the round-trips that
get cached in cache_read tokens (which the headline metric counts at
full price).

## Findings (bugs found and fixed during this run)

The first three v0.6 attempts on task 1 failed with cascading errors;
five distinct bugs surfaced as we drilled in. All five are fixed in
the same PR as this report.

### A. `ref-parser` accepts v0.5-shaped snapshot refs and quietly turns them into invalid CSS

The model, carrying habits from v0.5 `vortex_dom_click({index, snapshotId})`,
would emit `vortex_act({ target: "snap_xxx#54", action: "click" })`. The mcp
ref-parser only recognised the new `@eN` / `@fNeM` shape; anything else fell
through to the "treat as CSS selector" branch. The raw string then hit
`document.querySelector("snap_xxx#54")` inside the page-side actionability
probe, throwing `SyntaxError`, which surfaced two layers up as
`Cannot read properties of null (reading 'ok')` (chrome.scripting result was
nullish, and the host-side actionability wrapper accessed `.ok` on it
without guarding).

Fix: `parseRef` now rejects three shapes that look like leftover v0.5 refs
(`snap_*#N`, `#N` with N numeric, plain `N`) with a clear migration message
pointing at `@eN`. Page-side `probe` / `probeStable` also wrap the
querySelector call in try/catch so any future invalid selector returns a
structured `NOT_ATTACHED` instead of crashing the host wrapper.

### B. `NOT_ATTACHED` reason confused with "selector wrong"

Once A no longer crashed the wrapper, the same wrong-shape selectors fell
through to actionability and returned `NOT_ATTACHED` for "querySelector
returned no element". This is technically the same code path the page-side
probe already used for "element exists in the DOM but isn't connected"; the
model interpreted it as the latter and went into a 5-second retry loop
instead of fixing the selector. After fixing A and D, the model stopped
producing those selectors in the first place, so this no longer surfaces in
practice and we did not add a separate reason code.

### C. PR #4 renamed `vortex_observe.action` to `L4.observe`, but server.ts kept the v0.5 condition for the special dispatch path

`server.ts` has a special branch for `observe.snapshot` that does three
things v0.6 still depends on: it picks the compact-vs-full rendering, it
remembers the returned `snapshotId` in `activeSnapshotId` (which all
subsequent `@eN` refs need), and it uses the explicit `observe.snapshot`
action for the extension call. PR #4 changed the public tool's
`toolDef.action` from `observe.snapshot` to `L4.observe` for the L4 facade
naming, but the special-branch condition still tested the old string. As a
result every v0.6 `vortex_observe` skipped that branch entirely:
`activeSnapshotId` was never updated, every `@eN` ref afterwards threw
`STALE_SNAPSHOT: no active snapshot`, and the response came back as 60 KB
raw JSON instead of the compact format.

Fix: the condition now matches `toolDef.name === "vortex_observe"` as well
as the old `toolDef.action === "observe.snapshot"`, the `sendRequest` call
hard-codes `"observe.snapshot"` so the extension actually receives a known
action, and `scope` / `filter` are reshaped inline (the dispatch.ts
equivalent path is dead under this special branch since it returns early).

### D. `buildSelector` had no aria-label rung, so common widgets fell to nth-of-type paths that React invalidated

`observe` records each element's `_sel` so subsequent `@eN` refs can be
turned back into a CSS selector for actionability and click. The selector
priority was `id` > `data-testid` > `nth-of-type` path (up to 8 levels).
GitHub's Star button has neither an id nor a `data-testid`, so it landed
on the nth-of-type fallback. Between observe and the next act, the
search-results page kept re-rendering sibling repos, the indices shifted,
and `actionability` returned `NOT_ATTACHED` because the path no longer
matched. The model then retried with another observe and got the same
result.

Fix: aria-label is inserted as a third priority, but only when it
identifies the element uniquely (the candidate selector must match exactly
one element on the page). Otherwise we fall through to the nth-of-type
path so dom.click won't trip `SELECTOR_AMBIGUOUS`. For widgets with stable
aria-labels (Star buttons, primary nav, most form inputs) the resulting
selector survives sibling re-rendering.

### E. `loadPageSideModule` cached "loaded=true" across navigations

Once the page-side actionability bundle was injected into a tab, the
loader put `true` in its cache. The cache was only invalidated on
`chrome.tabs.onRemoved`. A `chrome.webNavigation.onCommitted` event
discards `window.__vortexActionability` along with everything else on the
target document, but the loader still believed the bundle was present and
skipped re-injection. The next actionability probe then ran the host-side
fallback `if (!A?.probe) return { ok: false, reason: "NOT_ATTACHED" }` for
the entire 5-second retry loop. This is what caused task 1 run 2 to
explode into nine `NOT_ATTACHED` failures even after fix D, until the
model stumbled onto a sequence that re-hydrated the bundle by accident
(`act hover` followed by `act click`).

Fix: the loader now also listens to `chrome.webNavigation.onCommitted`.
Main-frame commits clear the entire tab's cache (subframes are gone with
the parent document anyway); subframe commits clear just that frameId's
entry. The webNavigation permission was already declared in the manifest,
so this needs no install-time prompt.

## Method

For each (task, version, run) cell:

1. Make sure the browser starts in the same state described in the
   `docs/dogfood-prompts/<task>.prompt.md` preamble (e.g. logged in,
   target repo unstarred for task 1).
2. Open a fresh Claude Code session in the matching worktree
   (`.worktrees/v0.5-dogfood` for v0.5, `.worktrees/v0.6-pr5` for v0.6)
   so the right `.mcp.json` is picked up. The chrome extension must be
   loaded from the same worktree's `packages/extension/dist`.
3. Paste the prompt as the first message and let the agent run; do not
   interject. When it reports completion, type `/exit`.
4. Find the session jsonl under
   `~/.claude/projects/<cwd-encoded>/<uuid>.jsonl` (sorted newest first).
5. Run `node scripts/dogfood-extract.mjs <jsonl> --task <name>
   --version v0.5|v0.6 --run <N>` and save its stdout to
   `reports/dogfood/<task>-<version>-run<N>.json`.

The extractor sums `cache_read_tokens + cache_creation_tokens +
input_tokens + output_tokens` for `total_tokens`, counts assistant
records for `model_call_count`, and tallies tool_use blocks whose name
starts with `mcp__vortex__` (so internal `Bash` / `Read` / `ToolSearch`
calls do not skew the vortex tool count).

The extractor is bounded to assistant messages, so any wall-clock idle
between `/exit` and the next session start does not pollute the
duration figure even when several runs share a tmux window.

## Raw data

All eighteen per-run JSONs live next to this report under
`reports/dogfood/`. Naming follows
`<task>-<version>-run<N>.json`.
