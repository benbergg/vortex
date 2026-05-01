# Task 2 — Bytenew VOC platform read-only queries

> 把这一整段（包括标题）粘贴到 Claude Code 作为第一条消息。
> 仅在 chrome 已登录 `https://testc.bytenew.com/` 的 VOC 工作台 后跑（cookie 持久化）。

---

You have access to the `vortex` MCP server (browser automation).

The browser is already logged in at `https://testc.bytenew.com/` on the
"VOC 工作台" home. Complete the following five read-only queries in order
and report each answer briefly before proceeding to the next.

1. Open the **VOC 小程序**. How many top-level menus does it have?
2. Navigate to **智能辅助回评**. Filter by `平台评价情感 = 好评`. Report
   the total record count shown in the list.
3. Same page. Filter by `平台评价情感 = 中评 + 差评` (both selected).
   Report the total record count.
4. Same page. Clear the previous filter. Filter by
   `店铺 = 【天猫】欧莱雅男士官方旗舰店`. Report the total record count.
5. Same page. Clear the previous filter. Filter by
   `订单号 = <ORDER_ID_PLACEHOLDER>`. Report the **商品 ID** of the
   resulting row.

When all five answers are reported, summarise them in a single final
message and exit. Do **not** mutate any data — read only. Operate
efficiently — minimize redundant `observe` calls and verify each filter
took effect before reading the count.
