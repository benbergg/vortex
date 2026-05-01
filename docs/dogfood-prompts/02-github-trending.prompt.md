# Task 2 — GitHub Trending top 5 repos

> 把这一整段（包括标题）粘贴到 Claude Code 作为第一条消息。

---

You have access to the `vortex` MCP server (browser automation).

Goal: visit `https://github.com/trending` and report the **top 5 repositories
listed today**. For each one, give:

1. The repository owner/name (e.g. `vercel/next.js`)
2. The "stars today" number shown in the trending section (e.g. `+412 stars today`)

The browser is open at `https://github.com/`. Navigate to the trending page,
extract the data for the first 5 repositories, then summarise all 5 in a
single final message and exit.

Operate efficiently — minimize redundant `observe` calls. Verify you have
the right list (top of `/trending`, default tab "All languages" / "Today")
before reading.
