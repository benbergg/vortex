import { appendFileSync } from "fs";
import { Command } from "commander";
import { startServer } from "../src/index.js";

const LOG = "/tmp/vortex-server.log";
const log = (msg: string) => appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`);

log("=== vortex-server starting ===");
log(`pid=${process.pid} argv=${process.argv.join(" ")}`);
log(`stdin isTTY=${process.stdin.isTTY} stdout isTTY=${process.stdout.isTTY}`);

process.on("uncaughtException", (err) => {
  log(`UNCAUGHT: ${err.stack ?? err.message}`);
});
process.on("unhandledRejection", (err) => {
  log(`UNHANDLED: ${err}`);
});

const program = new Command();
program
  .option("--port <port>", "local HTTP/WS port", String(process.env.VORTEX_PORT ?? "6800"))
  .option("--no-local", "disable local HTTP/WS server (relay-only mode)")
  .option("--relay <url>", "relay server WS URL (e.g. wss://www.nicofroggo.cloud/vortex)")
  .option("--token <token>", "relay auth token (required with --relay)")
  .option("--session-name <name>", "session identifier for this device", "default")
  // Chrome Native Messaging 启动时会追加未知参数（--parent-window 等），放行
  .allowUnknownOption(true)
  .parse(process.argv);

const opts = program.opts();

try {
  const port = Number(opts.port) || 6800;
  const disableLocal = opts.local === false;

  log(`startServer opts: port=${port} disableLocal=${disableLocal} relay=${opts.relay ?? "<none>"}`);

  let relayConfig;
  if (opts.relay) {
    if (!opts.token) {
      console.error("[vortex-server] --relay requires --token");
      process.exit(1);
    }
    relayConfig = {
      url: opts.relay,
      token: opts.token,
      sessionName: opts.sessionName,
    };
  }

  startServer({ port, disableLocal, relay: relayConfig });
  log("startServer() returned");
} catch (err: any) {
  log(`STARTUP ERROR: ${err.stack ?? err.message}`);
  console.error(`[vortex-server] startup error: ${err.message}`);
  process.exit(1);
}
