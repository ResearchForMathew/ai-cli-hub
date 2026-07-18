#!/usr/bin/env node

import { main } from "../src/cli.mjs";

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(`aih: ${error.message}`);
  process.exitCode = 1;
}
