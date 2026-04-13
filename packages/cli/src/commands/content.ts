import type { Command } from "commander";
import { makeAction } from "./helpers.js";

export function registerContentCommands(program: Command): void {
  const content = program.command("content").description("Page content reading");

  content.command("getText").description("Get page text")
    .option("--selector <sel>", "element selector")
    .action(makeAction("content.getText", (_args, opts) => ({ selector: opts.selector })));

  content.command("getHTML").description("Get page HTML")
    .option("--selector <sel>", "element selector")
    .action(makeAction("content.getHTML", (_args, opts) => ({ selector: opts.selector })));

  content.command("getAccessibilityTree").description("Get accessibility tree")
    .action(makeAction("content.getAccessibilityTree", () => ({})));

  content.command("getElementText <selector>").description("Get element text")
    .action(makeAction("content.getElementText", (args) => ({ selector: args[0] })));

  content.command("getComputedStyle <selector>").description("Get computed style")
    .option("--properties <props>", "comma-separated property names")
    .action(makeAction("content.getComputedStyle", (args, opts) => ({
      selector: args[0],
      properties: opts.properties?.split(","),
    })));
}
