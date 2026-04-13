import type { Command } from "commander";
import { makeAction } from "./helpers.js";

export function registerKeyboardCommands(program: Command): void {
  const kb = program.command("keyboard").description("Keyboard events");

  kb.command("press <key>")
    .description("Press a key (Enter, Tab, Escape, ArrowDown, etc.)")
    .action(makeAction("keyboard.press", (args) => ({ key: args[0] })));

  kb.command("shortcut <keys...>")
    .description("Press a keyboard shortcut (e.g., Ctrl a)")
    .action(makeAction("keyboard.shortcut", (args) => ({ keys: args[0] })));
}
