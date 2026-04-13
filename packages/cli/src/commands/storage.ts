import type { Command } from "commander";
import { makeAction } from "./helpers.js";

export function registerStorageCommands(program: Command): void {
  const storage = program.command("storage").description("Cookie and storage management");

  storage.command("getCookies")
    .description("Get cookies")
    .option("--url <url>", "URL to get cookies for")
    .option("--domain <domain>", "domain filter")
    .action(makeAction("storage.getCookies", (_args, opts) => ({
      url: opts.url, domain: opts.domain,
    })));

  storage.command("setCookie")
    .description("Set a cookie")
    .requiredOption("--url <url>", "cookie URL")
    .requiredOption("--name <name>", "cookie name")
    .option("--value <value>", "cookie value", "")
    .option("--domain <domain>", "cookie domain")
    .option("--path <path>", "cookie path")
    .option("--secure", "secure flag")
    .option("--httpOnly", "httpOnly flag")
    .action(makeAction("storage.setCookie", (_args, opts) => ({
      url: opts.url, name: opts.name, value: opts.value,
      domain: opts.domain, path: opts.path,
      secure: opts.secure, httpOnly: opts.httpOnly,
    })));

  storage.command("deleteCookie")
    .description("Delete a cookie")
    .requiredOption("--url <url>", "cookie URL")
    .requiredOption("--name <name>", "cookie name")
    .action(makeAction("storage.deleteCookie", (_args, opts) => ({
      url: opts.url, name: opts.name,
    })));

  storage.command("getLocalStorage")
    .description("Get localStorage value(s)")
    .option("--key <key>", "specific key (omit for all)")
    .action(makeAction("storage.getLocalStorage", (_args, opts) => ({ key: opts.key })));

  storage.command("setLocalStorage")
    .description("Set localStorage value")
    .requiredOption("--key <key>", "storage key")
    .requiredOption("--value <value>", "storage value")
    .action(makeAction("storage.setLocalStorage", (_args, opts) => ({
      key: opts.key, value: opts.value,
    })));

  storage.command("getSessionStorage")
    .description("Get sessionStorage value(s)")
    .option("--key <key>", "specific key (omit for all)")
    .action(makeAction("storage.getSessionStorage", (_args, opts) => ({ key: opts.key })));

  storage.command("setSessionStorage")
    .description("Set sessionStorage value")
    .requiredOption("--key <key>", "storage key")
    .requiredOption("--value <value>", "storage value")
    .action(makeAction("storage.setSessionStorage", (_args, opts) => ({
      key: opts.key, value: opts.value,
    })));
}
