import type { Command } from "commander";
import { sendRequest } from "../client.js";
import { printResponse, exitWithError } from "../output.js";
import { writeFileSync } from "fs";

function getOpts(cmd: Command) {
  const root = cmd.parent!;
  return {
    port: root.opts().port as number,
    tab: root.opts().tab as number | undefined,
    pretty: root.opts().pretty as boolean | undefined,
    quiet: root.opts().quiet as boolean | undefined,
  };
}

export function registerShortcuts(program: Command): void {
  program
    .command("navigate <url>")
    .description("Navigate to URL (shortcut for page.navigate)")
    .action(async (url: string, _opts: unknown, cmd: Command) => {
      const { port, tab, pretty, quiet } = getOpts(cmd);
      try {
        const resp = await sendRequest("page.navigate", { url }, { port, tabId: tab });
        printResponse(resp, { pretty, quiet });
      } catch (err: any) {
        exitWithError(err.message);
      }
    });

  program
    .command("click <selector>")
    .description("Click an element (shortcut for dom.click)")
    .action(async (selector: string, _opts: unknown, cmd: Command) => {
      const { port, tab, pretty, quiet } = getOpts(cmd);
      try {
        const resp = await sendRequest("dom.click", { selector }, { port, tabId: tab });
        printResponse(resp, { pretty, quiet });
      } catch (err: any) {
        exitWithError(err.message);
      }
    });

  program
    .command("type <selector> <text>")
    .description("Type text into an element (shortcut for dom.type)")
    .option("--delay <ms>", "delay between keystrokes", parseInt)
    .action(async (selector: string, text: string, opts: any, cmd: Command) => {
      const { port, tab, pretty, quiet } = getOpts(cmd);
      try {
        const resp = await sendRequest(
          "dom.type",
          { selector, text, delay: opts.delay },
          { port },
        );
        printResponse(resp, { pretty, quiet });
      } catch (err: any) {
        exitWithError(err.message);
      }
    });

  program
    .command("fill <selector> <value>")
    .description("Fill a form field (shortcut for dom.fill)")
    .action(async (selector: string, value: string, _opts: unknown, cmd: Command) => {
      const { port, tab, pretty, quiet } = getOpts(cmd);
      try {
        const resp = await sendRequest("dom.fill", { selector, value }, { port, tabId: tab });
        printResponse(resp, { pretty, quiet });
      } catch (err: any) {
        exitWithError(err.message);
      }
    });

  program
    .command("eval <code>")
    .description("Execute JavaScript (shortcut for js.evaluate)")
    .action(async (code: string, _opts: unknown, cmd: Command) => {
      const { port, tab, pretty, quiet } = getOpts(cmd);
      try {
        const resp = await sendRequest("js.evaluate", { code }, { port, tabId: tab });
        printResponse(resp, { pretty, quiet });
      } catch (err: any) {
        exitWithError(err.message);
      }
    });

  program
    .command("screenshot")
    .description("Take a screenshot (shortcut for capture.screenshot)")
    .option("--output <file>", "save to file instead of printing data URL")
    .option("--format <fmt>", "png or jpeg", "png")
    .action(async (opts: any, cmd: Command) => {
      const { port, tab, pretty, quiet } = getOpts(cmd);
      try {
        const resp = await sendRequest(
          "capture.screenshot",
          { format: opts.format },
          { port, tabId: tab },
        );
        if (opts.output && resp.result) {
          const result = resp.result as { dataUrl: string };
          const base64 = result.dataUrl.replace(/^data:image\/\w+;base64,/, "");
          writeFileSync(opts.output, Buffer.from(base64, "base64"));
          console.log(`Screenshot saved to ${opts.output}`);
        } else {
          printResponse(resp, { pretty, quiet });
        }
      } catch (err: any) {
        exitWithError(err.message);
      }
    });

  program
    .command("text [selector]")
    .description("Get page text (shortcut for content.getText)")
    .action(async (selector: string | undefined, _opts: unknown, cmd: Command) => {
      const { port, tab, pretty, quiet } = getOpts(cmd);
      try {
        const resp = await sendRequest(
          "content.getText",
          { selector },
          { port, tabId: tab },
        );
        if (!pretty && !quiet && typeof resp.result === "string") {
          console.log(resp.result);
        } else {
          printResponse(resp, { pretty, quiet });
        }
      } catch (err: any) {
        exitWithError(err.message);
      }
    });
}
