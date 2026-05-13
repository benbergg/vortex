// Issue #21 — SPEC R1 / AC#1.
// Locks vortex_observe's public + internal schema surface for the
// includeBoxes option. Companion to I15 (tools-list-budget) which guards
// the byte ceiling but says nothing about which keys exist.

import { describe, it, expect } from "vitest";
import { getToolDef, getInternalToolDef } from "../src/tools/registry.js";

describe("vortex_observe includeBoxes — public schema (LLM-facing)", () => {
  const observe = getToolDef("vortex_observe");
  const props = (observe?.schema as { properties: Record<string, any> }).properties;

  it("vortex_observe is registered as a public tool", () => {
    expect(observe).toBeDefined();
  });

  it("properties.includeBoxes is declared", () => {
    expect(props.includeBoxes).toBeDefined();
  });

  it("includeBoxes is type boolean", () => {
    expect(props.includeBoxes.type).toBe("boolean");
  });

  it("includeBoxes carries NO description in public schema (§0.2.1 byte budget)", () => {
    expect(props.includeBoxes.description).toBeUndefined();
  });

  it("includeBoxes is NOT in `required` (optional, default off)", () => {
    const required = (observe?.schema as { required?: string[] }).required ?? [];
    expect(required.includes("includeBoxes")).toBe(false);
  });

  it("includeBoxes does not collide with existing observe params", () => {
    expect(Object.keys(props)).toEqual(
      expect.arrayContaining(["scope", "filter", "frames", "includeBoxes"]),
    );
  });
});

describe("vortex_observe includeBoxes — internal schema (full surface)", () => {
  const internal = getInternalToolDef("vortex_observe");
  const props = (internal?.schema as { properties: Record<string, any> }).properties;

  it("internal definition exposes includeBoxes", () => {
    expect(props.includeBoxes).toBeDefined();
  });

  it("internal includeBoxes carries description (LLM guidance)", () => {
    expect(typeof props.includeBoxes.description).toBe("string");
    expect(props.includeBoxes.description.length).toBeGreaterThan(20);
  });

  it("internal includeBoxes description names the contract (bbox + frame-local + integer)", () => {
    const desc: string = props.includeBoxes.description;
    expect(desc).toMatch(/bbox/);
    expect(desc).toMatch(/frame-local|frame local/);
    expect(desc).toMatch(/integer/);
  });

  it("internal includeBoxes default is false (backward compatibility)", () => {
    expect(props.includeBoxes.default).toBe(false);
  });
});

describe("vortex_observe includeBoxes — I15 byte budget preserved", () => {
  // I15.tools-list-budget.test.ts already asserts ≤ 4500 B for the whole
  // payload. Here we sanity-check that the additive key did not silently
  // explode the description through edits later. Anchor: 60-char ceiling.
  const observe = getToolDef("vortex_observe");

  it("public vortex_observe description still ≤ 60 char (I15 limit)", () => {
    expect((observe?.description ?? "").length).toBeLessThanOrEqual(60);
  });
});
