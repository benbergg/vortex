#!/usr/bin/env node
import { createProgram } from "../src/index.js";

const program = createProgram();
program.parseAsync(process.argv).catch((err) => {
  console.error(`error: ${err.message}`);
  process.exit(1);
});
