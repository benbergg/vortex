// Verifies v0.8 sub-project A: snapshot ref hash binding.
//
// Sequence:
//   1. observe1 → ref carries @<hash1>:eN
//   2. observe2 → fresh snapshot id, new hash2 (hash1 !== hash2)
//   3. act with observe1's ref → MUST surface STALE_SNAPSHOT
//
// Pre-v0.8 behaviour silently rebound @eN to whatever element sat at the
// same index slot in the new snapshot — exactly the footgun this fixes.
//
// Note on ctx.call error semantics: the bench runner does NOT throw on
// MCP isError responses. Errors come back as a result with
// isError: true and content[0].text shaped like
// "Error [STALE_SNAPSHOT]: ...". We parse that, not a thrown exception.

import type { CaseDefinition } from "../src/types.js";
import { extractText } from "./_helpers.js";

const HASHED_REF_RE = /(@([a-f0-9]{4}):(?:f\d+)?e\d+)/;

const def: CaseDefinition = {
  name: "cross-observe-ref-stale",
  playgroundPath: "/aria-cursor-nested.html",
  async run(ctx) {
    // Settle: static HTML page, give the renderer a tick to paint.
    await new Promise((r) => setTimeout(r, 200));

    // --- Observe 1 ---
    const snap1Text = extractText(await ctx.call("vortex_observe", {}));
    const ref1Match = snap1Text.match(HASHED_REF_RE);
    ctx.assert(
      ref1Match != null,
      `observe1 output must contain a hashed ref (@<hash>:eN). Got: ${snap1Text.slice(0, 400)}`,
    );
    const staleRef = ref1Match![1];
    const hash1 = ref1Match![2];
    ctx.recordMetric("observe1HashedRef", 1);

    // --- Observe 2 ---
    // Each observe call mints a fresh snapshotId (extension counter), so
    // hash2 differs from hash1 with overwhelming probability (collision
    // odds ≈ 1/65536 for a 4-hex prefix). No DOM mutation required.
    const snap2Text = extractText(await ctx.call("vortex_observe", {}));
    const ref2Match = snap2Text.match(HASHED_REF_RE);
    ctx.assert(
      ref2Match != null,
      `observe2 output must contain a hashed ref. Got: ${snap2Text.slice(0, 400)}`,
    );
    const hash2 = ref2Match![2];
    ctx.assert(
      hash1 !== hash2,
      `observe1 and observe2 should produce different snapshot hashes ` +
      `(got ${hash1} twice — possible 4-hex collision; rerun). ` +
      `Pre-condition for the staleness check.`,
    );

    // --- Act with stale ref ---
    // ctx.call returns the MCP result object directly — isError: true
    // is encoded in content, not as a thrown exception.
    const actResult = (await ctx.call("vortex_act", {
      target: staleRef,
      action: "click",
    })) as { isError?: boolean; content?: Array<{ text?: string }> };

    ctx.assert(
      actResult.isError === true,
      `Expected vortex_act with stale ref ${staleRef} to return isError, ` +
      `but got success. Result: ${JSON.stringify(actResult).slice(0, 400)}`,
    );

    const errText = actResult.content?.[0]?.text ?? "";
    ctx.assert(
      errText.includes("[STALE_SNAPSHOT]"),
      `Expected error text to include "[STALE_SNAPSHOT]", got: ${errText.slice(0, 400)}`,
    );

    ctx.recordMetric("staleSnapshotDetected", 1);
  },
};

export default def;
