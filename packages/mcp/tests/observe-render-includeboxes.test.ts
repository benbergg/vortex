// Issue #21 — SPEC R2/R3/R4/R5 + AC#2/#3/#4.
// Renderer-side contract for the includeBoxes opt-in. Companion to
// observe-includeboxes.test.ts in @bytenew/vortex-extension which
// exercises the payload-emission gate one layer up.

import { describe, it, expect } from "vitest";
import { renderObserveCompact } from "../src/lib/observe-render.js";
import type { CompactElement } from "../src/lib/observe-render.js";

type Frame = {
  frameId: number;
  parentFrameId: number;
  url: string;
  offset: { x: number; y: number };
  elementCount: number;
  truncated: boolean;
  scanned: boolean;
};

const mkFrame = (overrides: Partial<Frame> = {}): Frame => ({
  frameId: 0,
  parentFrameId: -1,
  url: "https://example.com/",
  offset: { x: 0, y: 0 },
  elementCount: 1,
  truncated: false,
  scanned: true,
  ...overrides,
});

const mkEl = (overrides: Partial<CompactElement> = {}): CompactElement => ({
  index: 0,
  tag: "button",
  role: "button",
  name: "Click me",
  frameId: 0,
  ...overrides,
});

const baseData = {
  snapshotId: "s_abc",
  url: "https://example.com/",
  frames: [mkFrame()],
  elements: [mkEl({ bbox: [10, 20, 30, 40] })],
};

describe("renderObserveCompact — includeBoxes opt-in (Issue #21)", () => {
  it("C-R1: includeBoxes=true with bbox emits ` bbox=[x,y,w,h]` segment", () => {
    const out = renderObserveCompact(baseData, null, true);
    expect(out).toContain('@e0 [button] "Click me" bbox=[10,20,30,40]');
  });

  it("C-R2: includeBoxes=false (default) emits no bbox= substring", () => {
    const out = renderObserveCompact(baseData, null, false);
    expect(out).not.toContain("bbox=");
    expect(out).toContain('@e0 [button] "Click me"');
  });

  it("C-R3: includeBoxes=true but el.bbox missing emits no bbox= (handler gated it off)", () => {
    const data = { ...baseData, elements: [mkEl()] }; // no bbox attached
    const out = renderObserveCompact(data, null, true);
    expect(out).toContain('@e0 [button] "Click me"');
    expect(out).not.toContain("bbox=");
  });

  it("C-R4: bbox numbers stringify as tuple, not JSON object/space form", () => {
    const data = { ...baseData, elements: [mkEl({ bbox: [101, 200, 51, 30] })] };
    const out = renderObserveCompact(data, null, true);
    // Expect compact `[101,200,51,30]` — no spaces, no x/y/w/h keys.
    expect(out).toContain("bbox=[101,200,51,30]");
    expect(out).not.toContain("bbox=[101, 200");
    expect(out).not.toContain('"x"');
  });

  it("C-R5: includeBoxes=true emits `# frame N offset=[x,y]` for every scanned non-main frame", () => {
    const data = {
      snapshotId: "s_iframe",
      url: "https://top.example/",
      frames: [
        mkFrame({ frameId: 0, offset: { x: 0, y: 0 } }),
        mkFrame({
          frameId: 7,
          parentFrameId: 0,
          url: "https://child.example/",
          offset: { x: 300, y: 150 },
          elementCount: 1,
        }),
      ],
      elements: [
        mkEl({ index: 0, bbox: [100, 200, 50, 30] }),
        mkEl({ index: 1, frameId: 7, bbox: [10, 20, 40, 25] }),
      ],
    };
    const out = renderObserveCompact(data, null, true);
    expect(out).toContain('@e0 [button] "Click me" bbox=[100,200,50,30]');
    expect(out).toContain('@f7e1 [button] "Click me" bbox=[10,20,40,25]');
    expect(out).toContain("# frame 7 offset=[300,150]");
  });

  it("C-R6: includeBoxes=false omits frame offset meta lines (backward compat)", () => {
    const data = {
      snapshotId: "s_iframe",
      url: "https://top.example/",
      frames: [
        mkFrame({ frameId: 0 }),
        mkFrame({ frameId: 7, offset: { x: 300, y: 150 } }),
      ],
      elements: [mkEl()],
    };
    const out = renderObserveCompact(data, null, false);
    expect(out).not.toContain("offset=");
  });

  it("C-R7: includeBoxes=true emits frame offset even when frame scanned but elementCount=0", () => {
    // Per SPEC: emit offset regardless of count so callers see the frame.
    const data = {
      snapshotId: "s_iframe",
      url: "https://top.example/",
      frames: [
        mkFrame({ frameId: 0 }),
        mkFrame({
          frameId: 9,
          parentFrameId: 0,
          url: "https://empty.example/",
          offset: { x: 50, y: 60 },
          elementCount: 0,
        }),
      ],
      elements: [mkEl()],
    };
    const out = renderObserveCompact(data, null, true);
    // The pre-existing "0 interactive elements" note stays:
    expect(out).toContain("# frame 9 scanned, 0 interactive elements");
    // AND the new offset line is also emitted:
    expect(out).toContain("# frame 9 offset=[50,60]");
  });

  it("C-R8: includeBoxes=true does NOT emit offset for unscanned frames", () => {
    // Unscanned frames carry no offset semantics for the caller.
    const data = {
      snapshotId: "s_iframe",
      url: "https://top.example/",
      frames: [
        mkFrame({ frameId: 0 }),
        mkFrame({
          frameId: 11,
          parentFrameId: 0,
          url: "https://crossorigin.example/",
          offset: { x: 100, y: 100 },
          elementCount: 0,
          scanned: false,
        }),
      ],
      elements: [mkEl()],
    };
    const out = renderObserveCompact(data, null, true);
    expect(out).toContain("# frame 11 not scanned");
    expect(out).not.toContain("# frame 11 offset=");
  });

  it("C-R9: default-off baseline parity — undefined vs explicit false produce identical output", () => {
    const out1 = renderObserveCompact(baseData, "a3f7");
    const out2 = renderObserveCompact(baseData, "a3f7", false);
    expect(out1).toBe(out2);
    // And both omit any bbox=
    expect(out1).not.toContain("bbox=");
  });

  it("C-R10: hashed ref form coexists with bbox segment", () => {
    const out = renderObserveCompact(baseData, "a3f7", true);
    expect(out).toContain('@a3f7:e0 [button] "Click me" bbox=[10,20,30,40]');
  });

  it("C-R11: state flags render before bbox segment", () => {
    const data = {
      ...baseData,
      elements: [mkEl({ state: { disabled: true }, bbox: [5, 6, 7, 8] })],
    };
    const out = renderObserveCompact(data, null, true);
    // Order: ref [role] "name" [state-flags...] bbox=...
    expect(out).toContain('@e0 [button] "Click me" [disabled] bbox=[5,6,7,8]');
  });
});
