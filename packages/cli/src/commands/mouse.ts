import type { Command } from "commander";
import { makeAction } from "./helpers.js";

export function registerMouseCommands(program: Command): void {
  const mouse = program.command("mouse").description("Mouse events (CDP)");

  mouse.command("click <x> <y>")
    .description("Click at coordinates")
    .option("--button <b>", "left/right/middle", "left")
    .action(makeAction("mouse.click", (args, opts) => ({
      x: parseFloat(args[0]),
      y: parseFloat(args[1]),
      button: opts.button,
    })));

  mouse.command("doubleClick <x> <y>")
    .description("Double-click at coordinates")
    .action(makeAction("mouse.doubleClick", (args) => ({
      x: parseFloat(args[0]),
      y: parseFloat(args[1]),
    })));

  mouse.command("move <x> <y>")
    .description("Move mouse to coordinates (triggers hover)")
    .action(makeAction("mouse.move", (args) => ({
      x: parseFloat(args[0]),
      y: parseFloat(args[1]),
    })));
}
