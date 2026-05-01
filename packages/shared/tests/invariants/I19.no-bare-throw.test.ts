// I19 part 2: 全 src/ 不许 `throw new Error(` 不经 vtxError 包装
// spec: vortex重构-L5-spec.md §1.3
//
// 例外白名单：
//   - lib/internal/* （纯逻辑工具，不向上抛 VtxError）
//   - 测试文件 (*.test.ts) 不查
//   - shared/src/errors.ts （VtxError 类自身定义）
//
// 所有面向 LLM 的错误必须经 vtxError 工厂带 code + hint，避免 LLM 拿到无 code 的裸文案。

import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// repo root：从 packages/shared/tests/invariants/ 上溯 4 层
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

const SCAN_PATHS = [
  "packages/extension/src",
  "packages/mcp/src",
  "packages/server/src",
  "packages/shared/src",
];

// 例外路径（lib/internal/ 纯逻辑、shared errors.ts VtxError 类、page-side bundle 入口）
const ALLOWLIST = [
  /\/lib\/internal\//,
  /packages\/shared\/src\/errors\.ts$/,        // VtxError class 自身
  /packages\/shared\/src\/errors\.hints\.ts$/, // hint 表 (无 throw)
];

describe("I19: no bare `throw new Error(` outside allowlist", () => {
  it("packages/{extension,mcp,server,shared}/src 全部经 vtxError 包装", () => {
    let output = "";
    try {
      output = execSync(
        `grep -rn 'throw new Error(' ${SCAN_PATHS.join(" ")} --include='*.ts'`,
        { cwd: REPO_ROOT, encoding: "utf-8" },
      );
    } catch (err) {
      // grep 无匹配会 exit code 1，捕获后 output 为空
      const e = err as { stdout?: string; status?: number };
      if (e.status === 1) {
        output = e.stdout ?? "";
      } else {
        throw err;
      }
    }

    const lines = output
      .split("\n")
      .filter((l) => l.trim() !== "")
      .filter((l) => !ALLOWLIST.some((re) => re.test(l)));

    expect(
      lines,
      `Found bare throw new Error() — wrap with vtxError(code, msg, ctx):\n${lines.join("\n")}`,
    ).toEqual([]);
  });
});
