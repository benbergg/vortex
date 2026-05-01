# Task 1 — GitHub search + star first repo

> 把这一整段（包括标题）粘贴到 Claude Code 作为第一条消息。

---

[isolation] This is a fresh dogfood baseline run. Do NOT read any project
file, CLAUDE.md, git history, or memory. Do NOT consult prior sessions.
Use only the `vortex` MCP tools to perform the task below — execute it as
if seeing it for the first time.

You have access to the `vortex` MCP server (browser automation).

Goal: on `github.com`, search for the keyword **playwright**, then click the
star button of the first repository in the search results so its state shows
"Starred".

The browser is already open at `https://github.com/` and is logged in. Use
the vortex tools to perform the task. When the first result's star button
shows "Starred", report success and exit.

Please operate efficiently — minimize redundant `observe` calls. After
clicking the star button, verify the state change before reporting success.
