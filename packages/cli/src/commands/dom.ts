import type { Command } from "commander";
import { makeAction } from "./helpers.js";

export function registerDomCommands(program: Command): void {
  const dom = program.command("dom").description("DOM query and interaction");

  dom.command("query <selector>").description("Find element by selector")
    .action(makeAction("dom.query", (args) => ({ selector: args[0] })));

  dom.command("queryAll <selector>").description("Find all matching elements")
    .action(makeAction("dom.queryAll", (args) => ({ selector: args[0] })));

  dom.command("click <selector>").description("Click element")
    .option("--real-mouse", "Use CDP real mouse events (bypass React synthetic events)")
    .action(makeAction("dom.click", (args, opts) => ({
      selector: args[0],
      useRealMouse: opts.realMouse,
    })));

  dom.command("type <selector> <text>").description("Type text into element")
    .option("--delay <ms>", "delay between keystrokes", parseInt)
    .action(makeAction("dom.type", (args, opts) => ({
      selector: args[0], text: args[1], delay: opts.delay,
    })));

  dom.command("fill <selector> <value>").description("Fill form field")
    .action(makeAction("dom.fill", (args) => ({ selector: args[0], value: args[1] })));

  dom.command("select <selector> <value>").description("Select dropdown option")
    .action(makeAction("dom.select", (args) => ({ selector: args[0], value: args[1] })));

  dom.command("scroll").description("Scroll page or container")
    .option("--selector <sel>", "element to scroll to")
    .option("--container <sel>", "scroll container")
    .option("--position <pos>", "top/bottom/left/right")
    .option("--x <px>", "x coordinate", parseInt)
    .option("--y <px>", "y coordinate", parseInt)
    .action(makeAction("dom.scroll", (_args, opts) => ({
      selector: opts.selector, container: opts.container,
      position: opts.position, x: opts.x, y: opts.y,
    })));

  dom.command("hover <selector>").description("Hover over element")
    .action(makeAction("dom.hover", (args) => ({ selector: args[0] })));

  dom.command("getAttribute <selector> <attribute>").description("Get element attribute")
    .action(makeAction("dom.getAttribute", (args) => ({ selector: args[0], attribute: args[1] })));

  dom.command("getScrollInfo").description("Get scroll position")
    .option("--selector <sel>", "element to check")
    .action(makeAction("dom.getScrollInfo", (_args, opts) => ({ selector: opts.selector })));

  dom.command("waitForMutation <selector>").description("Wait for DOM changes")
    .option("--timeout <ms>", "timeout in ms", parseInt, 10000)
    .action(makeAction("dom.waitForMutation", (args, opts) => ({
      selector: args[0], timeout: opts.timeout,
    })));
}
