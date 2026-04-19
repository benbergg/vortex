import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadScenario } from "../src/runner/scenario.js";

async function mkScenarioDir(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "scenario-"));
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dir, name), content);
  }
  return dir;
}

describe("scenario loader: disabledTools + L1b layer", () => {
  it("parses disabledTools array", async () => {
    const dir = await mkScenarioDir({
      "task.md": "test task",
      "expected.json": JSON.stringify({
        layer: "L1b",
        expectedErrorCode: "ELEMENT_OCCLUDED",
        disabledTools: ["vortex_observe"],
        assertions: [{ type: "agent_success" }],
      }),
    });
    const s = await loadScenario(dir);
    expect(s.expected.layer).toBe("L1b");
    expect(s.expected.disabledTools).toEqual(["vortex_observe"]);
  });

  it("missing disabledTools stays undefined (backward compat)", async () => {
    const dir = await mkScenarioDir({
      "task.md": "test",
      "expected.json": JSON.stringify({ layer: "L1", assertions: [] }),
    });
    const s = await loadScenario(dir);
    expect(s.expected.disabledTools).toBeUndefined();
  });
});
