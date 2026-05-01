# Task 2 — Internal ERP login + product sync

> 把这一整段（包括标题）粘贴到 Claude Code 作为第一条消息。
> 仅在 VPN 已接通 + ERP cookie 持久化 后跑。

---

You have access to the `vortex` MCP server (browser automation).

Goal: log into the internal ERP system, then trigger a product data sync and
wait until the sync status shows "已完成" (completed).

The browser is already open at the ERP login page. SSO session may need
re-confirmation; if a code / 2FA is required, report the blocker and exit.
After login, navigate to the product sync section, start a sync for the
preset SKU scope, and wait until the status reads "已完成".

When the sync status reads "已完成", report success with the sync task ID.
Operate efficiently — minimize redundant `observe` calls.
