// I1: cdp.ts 不被 L2 (action/) / L3 (reasoning/) 直接 import。
// 通过运行 depcruise CLI 校验，无违规则全绿；否则报错带具体违规边。

import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PKG_DIR = path.resolve(__dirname, "..", "..");

describe("I1: depcruise enforces L1 cdp encapsulation", () => {
  it("当前代码库无 forbidden 依赖违反", () => {
    let output = "";
    let exitCode = 0;
    try {
      output = execSync("pnpm depcruise:check", {
        cwd: PKG_DIR,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e: any) {
      exitCode = e.status ?? 1;
      output = (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? "");
    }
    expect(exitCode, `depcruise should pass; output:\n${output}`).toBe(0);
  }, 60_000); // depcruise 全量扫可能 10-30s
});
