import type { Command } from "commander";
import { makeAction, makeSubscribeAction } from "./helpers.js";

export function registerConsoleCommands(program: Command): void {
  const con = program.command("console").description("Console log monitoring");

  con.command("subscribe")
    .description("Subscribe to console events (use Ctrl+C to stop)")
    .action(makeSubscribeAction("console.subscribe", () => ({})));

  con.command("getLogs")
    .description("Get cached console logs")
    .option("--level <level>", "filter by level (log/warn/error)")
    .action(makeAction("console.getLogs", (_args, opts) => ({ level: opts.level })));

  con.command("getErrors")
    .description("Get console errors only")
    .action(makeAction("console.getErrors", () => ({})));

  con.command("clear")
    .description("Clear console log cache")
    .action(makeAction("console.clear", () => ({})));
}
