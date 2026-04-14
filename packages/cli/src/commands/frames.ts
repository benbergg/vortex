import type { Command } from "commander";
import { makeAction } from "./helpers.js";

export function registerFramesCommands(program: Command): void {
  const frames = program.command("frames").description("Iframe discovery");

  frames.command("list")
    .description("List all frames (including iframes) in the tab")
    .action(makeAction("frames.list", () => ({})));

  frames.command("find <urlPattern>")
    .description("Find a frame by URL substring match")
    .action(makeAction("frames.find", (args) => ({ urlPattern: args[0] })));
}
