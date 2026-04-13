import type { Command } from "commander";
import { makeAction } from "./helpers.js";

export function registerPageCommands(program: Command): void {
  const page = program.command("page").description("Page navigation");

  page.command("navigate <url>")
    .description("Navigate to URL")
    .option("--no-wait", "don't wait for page load")
    .option("--timeout <ms>", "navigation timeout", parseInt)
    .action(makeAction("page.navigate", (args, opts) => ({
      url: args[0],
      waitForLoad: opts.wait !== false,
      timeout: opts.timeout,
    })));

  page.command("reload").description("Reload page")
    .action(makeAction("page.reload", () => ({})));

  page.command("back").description("Go back")
    .action(makeAction("page.back", () => ({})));

  page.command("forward").description("Go forward")
    .action(makeAction("page.forward", () => ({})));

  page.command("wait")
    .description("Wait for selector or timeout")
    .option("--selector <sel>", "CSS selector to wait for")
    .option("--timeout <ms>", "timeout in ms", parseInt, 10000)
    .action(makeAction("page.wait", (_args, opts) => ({
      selector: opts.selector,
      timeout: opts.timeout,
    })));

  page.command("info").description("Get page info")
    .action(makeAction("page.info", () => ({})));
}
