# bytenew-voc-query · v0.6 · run 1 · BLOCKED

- **Date**: 2026-05-01
- **Session**: `~/.claude/projects/-Users-lg-workspace-vortex/492916f8-a189-4611-acf3-c9368334b10b.jsonl`
- **Outcome**: ❌ **Hard block** — completed Q1 only; Q2/Q3/Q5 unreachable; Q4 partial.
- **Metrics**: see `bytenew-voc-query-v0.6-run1.json` (128 model calls, 762 s, 9.58 M tokens, 48 vortex tool calls).

## Per-question result

| # | Question | Answer | Source | Status |
|---|----------|--------|--------|--------|
| 1 | VOC 小程序 top-level menu count | **4** (VOC评价 / VOC聊天 / VOC洞察 / VOC标签) | screenshot OCR | ✅ |
| 2 | 平台评价情感=好评 count | — | — | ❌ blocked |
| 3 | 平台评价情感=中评+差评 count | — | — | ❌ blocked |
| 4 | 店铺=【天猫】欧莱雅男士官方旗舰店 count | **597** (unverified) | screenshot — page already had this filter on the chip and table was uniform; "重置 then re-apply" not done | ⚠️ partial |
| 5 | 订单号 → 商品 ID | — | — | ❌ blocked (also needs real order id; prompt template still has `<ORDER_ID_PLACEHOLDER>`) |

## Root cause — vortex cannot see the VOC sub-app DOM

Once the page enters `https://testc.bytenew.com/app.html#/applet/voc` after login, every vortex DOM-facing tool returns near-empty:

- `vortex_observe(filter=all, scope=full)` → `candidateCount=14, returnedCount=4`. All 4 returned elements sit in the leftmost 60 px global app launcher (x=0, w=60). The entire VOC sub-app at x≥60 is invisible to the observer.
- `vortex_extract(target="html", depth=20, include=["text"])` → returns only the outer shell text: `首页\nVOC工作台\n小程序\n服务大厅\n搜索\n70`. Whole VOC sub-app text is not in the a11y tree it returns.
- `vortex_act` with broad fallback selectors fails:
  - `.el-button` → `ELEMENT_NOT_FOUND`
  - `[class*="button"]` → `ELEMENT_NOT_FOUND`
  - `.idux-button, .var-button, .van-button, .at-btn, .ivu-btn, .n-button, .vxe-button` → `ELEMENT_NOT_FOUND`
- The login page on the same domain works fine — `act` filled phone/password and clicked `.el-button--primary`. So the bug is **specific to the post-login VOC sub-app**, not a global vortex failure.
- `frameCount=1, scannedFrames=1` — there is no iframe boundary that vortex is missing.
- `vortex_debug_read(source=network)` → `[]` (vortex did not start sniffing before the existing tab's traffic, so no API URLs were captured to call directly).
- The `target` object form (e.g. `{role:"textbox", name:"密码"}`) consistently throws `input.startsWith is not a function` — a separate bug. Only string selectors work.
- claude-in-chrome (`tabs_context_mcp`) returned "Browser extension is not connected", so cross-tool fallback was unavailable.

The signature (login DOM works, sub-app DOM doesn't, a11y tree empty, all class probes empty, no iframe) most strongly suggests **closed Shadow DOM** (or a comparable custom render boundary) inside the VOC applet shell.

## Repro steps

1. Start a fresh Claude Code session at the vortex repo root with vortex MCP attached.
2. Paste `docs/dogfood-prompts/02-bytenew-voc-query.prompt.md` verbatim.
3. Page lands on `app.html#/login` (session expired). User pastes credentials in chat; agent logs in via `act` on the login page → succeeds.
4. After redirect to `app.html#/applet/voc`, all observe/extract/act calls aimed at the VOC sub-app fail as above.

## Implications for v0.6 release gate

- This task is one of three **hard-gate** dogfood prompts. With v0.6 it is **not passable end-to-end**.
- The same site likely passed (or would have passed) on v0.5 only because v0.5's surface is different — needs a v0.5 baseline run to confirm whether this is a v0.6 regression or a long-standing limitation.
- Concrete vortex bugs surfaced (independent of the Shadow DOM root cause):
  1. `vortex_act` `target` object form: `input.startsWith is not a function` (regression candidate — the tool advertises `oneOf: [string, {role,name,...}]`).
  2. `vortex_press` rejects the documented `keys` param with `key is required` — the schema and the runtime disagree.
- Suggested follow-ups (not done in this session, only logged):
  - L1 / L2 spec audit: does any layer attempt to pierce closed Shadow DOM? Should it warn instead of returning empty?
  - Add a "DOM coverage" sanity check after navigation — if `observe` returns ≥X% of the visible viewport area as element-free, surface a warning.
  - Fix the `target` object form bug.
  - Reconcile `vortex_press` schema with implementation.

## Decision

Marking task as **C — terminate dogfood, file finding** per the user's choice. Keep this run's metrics in the aggregate so the v0.6 release-gate page is honest about the block.
