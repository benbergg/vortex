import { appendFileSync } from "fs";
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

try {
  const port = Number(process.env.VORTEX_PORT) || 6800;
  log(`starting server on port ${port}`);
  startServer(port);
  log("startServer() returned");
} catch (err: any) {
  log(`STARTUP ERROR: ${err.stack ?? err.message}`);
}
