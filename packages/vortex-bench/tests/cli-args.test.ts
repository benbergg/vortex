import { describe, it, expect } from "vitest";
import { parseRunArgs } from "../src/index.js";

describe("parseRunArgs", () => {
  it("extracts positional scenarioDir", () => {
    expect(parseRunArgs(["scenarios/v1"])).toEqual({
      scenarioDir: "scenarios/v1",
      repeats: 1,
      verboseRuns: false,
    });
  });

  it("parses --repeats N", () => {
    expect(parseRunArgs(["scenarios/v1", "--repeats", "3"])).toMatchObject({
      scenarioDir: "scenarios/v1",
      repeats: 3,
    });
  });

  it("parses --repeats=N syntax", () => {
    expect(parseRunArgs(["scenarios/v1", "--repeats=5"])).toMatchObject({
      repeats: 5,
    });
  });

  it("flag before positional also works", () => {
    expect(parseRunArgs(["--repeats", "3", "scenarios/v1"])).toMatchObject({
      scenarioDir: "scenarios/v1",
      repeats: 3,
    });
  });

  it("parses --verbose-runs (bool flag)", () => {
    expect(parseRunArgs(["scenarios/v1", "--verbose-runs"])).toMatchObject({
      verboseRuns: true,
    });
  });

  it("rejects --repeats=0", () => {
    expect(() => parseRunArgs(["scenarios/v1", "--repeats", "0"])).toThrow(/repeats/);
  });

  it("rejects non-integer --repeats", () => {
    expect(() => parseRunArgs(["scenarios/v1", "--repeats", "abc"])).toThrow();
  });

  it("env BENCH_REPEATS fallback when flag absent", () => {
    const prev = process.env.BENCH_REPEATS;
    process.env.BENCH_REPEATS = "2";
    try {
      expect(parseRunArgs(["scenarios/v1"])).toMatchObject({ repeats: 2 });
    } finally {
      if (prev === undefined) delete process.env.BENCH_REPEATS;
      else process.env.BENCH_REPEATS = prev;
    }
  });

  it("flag overrides env", () => {
    const prev = process.env.BENCH_REPEATS;
    process.env.BENCH_REPEATS = "2";
    try {
      expect(parseRunArgs(["scenarios/v1", "--repeats", "5"])).toMatchObject({ repeats: 5 });
    } finally {
      if (prev === undefined) delete process.env.BENCH_REPEATS;
      else process.env.BENCH_REPEATS = prev;
    }
  });
});
