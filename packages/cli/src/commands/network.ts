import type { Command } from "commander";
import { makeAction, makeSubscribeAction } from "./helpers.js";

export function registerNetworkCommands(program: Command): void {
  const net = program.command("network").description("Network monitoring");

  net.command("subscribe")
    .description("Subscribe to network events (use Ctrl+C to stop)")
    .action(makeSubscribeAction("network.subscribe", () => ({})));

  net.command("getLogs")
    .description("Get cached network logs")
    .action(makeAction("network.getLogs", () => ({})));

  net.command("getErrors")
    .description("Get network errors (status >= 400 or failed)")
    .action(makeAction("network.getErrors", () => ({})));

  net.command("filter")
    .description("Filter network logs")
    .option("--url <pattern>", "URL pattern")
    .option("--method <method>", "HTTP method")
    .option("--status-min <n>", "minimum status code", parseInt)
    .option("--status-max <n>", "maximum status code", parseInt)
    .action(makeAction("network.filter", (_args, opts) => ({
      url: opts.url, method: opts.method,
      statusMin: opts.statusMin, statusMax: opts.statusMax,
    })));

  net.command("clear")
    .description("Clear network log cache")
    .action(makeAction("network.clear", () => ({})));
}
