import type { Command } from "commander";
import { makeAction, makeSubscribeAction } from "./helpers.js";

export function registerNetworkCommands(program: Command): void {
  const net = program.command("network").description("Network monitoring");

  net.command("subscribe")
    .description("Subscribe to network events (use Ctrl+C to stop)")
    .option("--url-pattern <p>", "Only capture URLs matching this substring")
    .option("--types <list>", "Comma-separated resource types (XHR,Fetch,Document,Script,Stylesheet,Image,Media,Font)")
    .option("--max-api <n>", "Max API logs to keep", parseInt)
    .option("--max-resource <n>", "Max resource logs to keep", parseInt)
    .action(makeSubscribeAction("network.subscribe", (_args, opts) => ({
      urlPattern: opts.urlPattern,
      types: opts.types ? opts.types.split(",") : undefined,
      maxApiLogs: opts.maxApi,
      maxResourceLogs: opts.maxResource,
    })));

  net.command("getLogs")
    .description("Get cached network logs (API only by default)")
    .option("--include-resources", "Include static resources (images, scripts, stylesheets)")
    .action(makeAction("network.getLogs", (_args, opts) => ({
      includeResources: opts.includeResources,
    })));

  net.command("getErrors")
    .description("Get network errors (status >= 400 or failed)")
    .option("--include-resources", "Include static resources (images, scripts, stylesheets)")
    .action(makeAction("network.getErrors", (_args, opts) => ({
      includeResources: opts.includeResources,
    })));

  net.command("filter")
    .description("Filter network logs")
    .option("--url <pattern>", "URL pattern")
    .option("--method <method>", "HTTP method")
    .option("--status-min <n>", "minimum status code", parseInt)
    .option("--status-max <n>", "maximum status code", parseInt)
    .option("--include-resources", "Include static resources (images, scripts, stylesheets)")
    .action(makeAction("network.filter", (_args, opts) => ({
      url: opts.url, method: opts.method,
      statusMin: opts.statusMin, statusMax: opts.statusMax,
      includeResources: opts.includeResources,
    })));

  net.command("getResponseBody <requestId>")
    .description("Get response body for a specific request")
    .action(makeAction("network.getResponseBody", (args) => ({ requestId: args[0] })));

  net.command("clear")
    .description("Clear network log cache")
    .action(makeAction("network.clear", () => ({})));
}
