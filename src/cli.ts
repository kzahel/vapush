#!/usr/bin/env node
/**
 * vapush CLI
 */

import { createServer } from "./server.js";

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = args.find((a) => a.startsWith(prefix));
  return arg?.slice(prefix.length);
}

const port = parseInt(getArg("port") ?? "3000", 10);
const host = getArg("host") ?? "0.0.0.0";
const dataDir = getArg("data-dir");

createServer({ port, host, dataDir }).catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
