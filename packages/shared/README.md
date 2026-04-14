# @bytenew/vortex-shared

Vortex 单子项目共享的类型与协议常量。**纯类型 / 常量包，无运行时副作用**。所有上游（extension / server / cli / mcp）都从这里导入，避免协议分裂。

## 内容

| 文件 | 内容 |
|------|------|
| `actions.ts` | 全部 action 名常量（`PageActions.NAVIGATE = "page.navigate"` 等），按模块分组的枚举 |
| `protocol.ts` | `VtxRequest` / `VtxResponse` / `VtxEvent` / `NmRequest` / `NmResponse` 等线缆消息类型 |
| `errors.ts` | `VtxErrorCode` 枚举（`TIMEOUT`、`NOT_FOUND`、`PERMISSION_DENIED` 等） |
| `index.ts` | 统一 re-export |

## 使用

```ts
import {
  PageActions, DomActions,
  type VtxRequest, type VtxResponse,
  VtxErrorCode,
} from "@bytenew/vortex-shared";

const req: VtxRequest = {
  id: "x",
  action: PageActions.NAVIGATE,
  params: { url: "https://example.com" },
};
```

## 添加/修改 action

1. 在 `actions.ts` 对应模块枚举里新增条目
2. extension 端在 `packages/extension/src/handlers/<mod>.ts` 注册处理函数
3. 如需新错误码：在 `errors.ts` 加 `VtxErrorCode` 成员

## 构建

```bash
pnpm build       # tsc 一次
pnpm dev         # tsc --watch
```

下游包通过 workspace 协议引用：`"@bytenew/vortex-shared": "workspace:*"`，改动后无需 publish 即生效。
