import type { Command } from "commander";
import { makeAction } from "./helpers.js";

export function registerTabCommands(program: Command): void {
  const tab = program.command("tab").description("Tab management");

  tab.command("list")
    .description("List all tabs")
    .action(makeAction("tab.list", () => ({})));

  tab.command("create")
    .description("Create a new tab")
    .option("--url <url>", "URL to open")
    .action(makeAction("tab.create", (_args, opts) => ({ url: opts.url })));

  tab.command("close <tabId>")
    .description("Close a tab")
    .action(makeAction("tab.close", (args) => ({ tabId: parseInt(args[0]) })));

  tab.command("activate <tabId>")
    .description("Activate a tab")
    .action(makeAction("tab.activate", (args) => ({ tabId: parseInt(args[0]) })));

  tab.command("info")
    .description("Get tab info")
    .action(makeAction("tab.getInfo", () => ({})));
}
