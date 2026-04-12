import { startServer } from "../src/index.js";

const port = Number(process.env.VORTEX_PORT) || 6800;
startServer(port);
