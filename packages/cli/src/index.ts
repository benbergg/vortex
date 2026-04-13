import { Command } from "commander";
import { registerShortcuts } from "./commands/shortcuts.js";
import { registerTabCommands } from "./commands/tab.js";
import { registerPageCommands } from "./commands/page.js";
import { registerDomCommands } from "./commands/dom.js";
import { registerContentCommands } from "./commands/content.js";
import { registerJsCommands } from "./commands/js.js";
import { registerCaptureCommands } from "./commands/capture.js";
import { registerConsoleCommands } from "./commands/console.js";
import { registerNetworkCommands } from "./commands/network.js";
import { registerStorageCommands } from "./commands/storage.js";
import { registerFileCommands } from "./commands/file.js";
import { registerRawCommand } from "./commands/raw.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("vortex")
    .description("Browser automation CLI — control Chrome from the terminal")
    .version("0.1.0")
    .option("--tab <id>", "target tab ID", parseInt)
    .option("--port <port>", "server port", parseInt, 6800)
    .option("--pretty", "pretty-print JSON output")
    .option("--quiet", "only output result, no wrapper");

  // 高频快捷命令
  registerShortcuts(program);

  // 命名空间命令
  registerTabCommands(program);
  registerPageCommands(program);
  registerDomCommands(program);
  registerContentCommands(program);
  registerJsCommands(program);
  registerCaptureCommands(program);
  registerConsoleCommands(program);
  registerNetworkCommands(program);
  registerStorageCommands(program);
  registerFileCommands(program);

  // 通用 raw 命令
  registerRawCommand(program);

  return program;
}
