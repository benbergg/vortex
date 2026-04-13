import type { Command } from "commander";
import { makeAction } from "./helpers.js";

export function registerJsCommands(program: Command): void {
  const js = program.command("js").description("JavaScript execution");

  js.command("evaluate <code>").description("Execute JS in page")
    .action(makeAction("js.evaluate", (args) => ({ code: args[0] })));

  js.command("evaluateAsync <code>").description("Execute async JS")
    .action(makeAction("js.evaluateAsync", (args) => ({ code: args[0] })));

  js.command("callFunction <name>").description("Call a page function")
    .option("--args <json>", "JSON array of arguments")
    .action(makeAction("js.callFunction", (args, opts) => ({
      name: args[0],
      args: opts.args ? JSON.parse(opts.args) : [],
    })));
}
