#!/usr/bin/env node

import { spawn } from "node:child_process";

const binary = process.env.SPINE_CODEX_BINARY;
if (!binary) {
  console.error("spine-codex shim: SPINE_CODEX_BINARY is not set");
  process.exit(1);
}

const commandArguments = [
  "--disable",
  "image_generation",
  ...process.argv.slice(2),
];
const shell = process.platform === "win32" && /\.(?:cmd|bat)$/i.test(binary);
const child = spawn(binary, commandArguments, {
  env: process.env,
  shell,
  stdio: "inherit",
  windowsHide: true,
});

child.once("error", (error) => {
  console.error(`spine-codex shim: ${error.message}`);
  process.exit(1);
});
child.once("exit", (status, signal) => {
  if (signal) {
    console.error(`spine-codex shim: child exited from signal ${signal}`);
    process.exit(1);
  }
  process.exit(status ?? 1);
});
