#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createAppServerOutputFilter } from "../lib/app-server-output-filter.mjs";

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
const filtersAppServerOutput = process.argv.slice(2).includes("app-server");
const child = spawn(binary, commandArguments, {
  env: process.env,
  shell,
  stdio: filtersAppServerOutput ? ["inherit", "pipe", "inherit"] : "inherit",
  windowsHide: true,
});

let outputDrained = Promise.resolve();
if (filtersAppServerOutput) {
  let reportedSuppression = false;
  const filter = createAppServerOutputFilter({
    onSuppressed() {
      if (reportedSuppression) return;
      reportedSuppression = true;
      console.error(
        "spine-codex shim: suppressed duplicate app/list/updated notifications",
      );
    },
  });
  outputDrained = new Promise((resolve, reject) => {
    filter.once("end", resolve);
    filter.once("error", reject);
    child.stdout.once("error", reject);
  });
  child.stdout.pipe(filter).pipe(process.stdout, { end: false });
}

child.once("error", (error) => {
  console.error(`spine-codex shim: ${error.message}`);
  process.exit(1);
});
child.once("exit", async (status, signal) => {
  try {
    await outputDrained;
  } catch (error) {
    console.error(`spine-codex shim: stdout filter failed: ${error.message}`);
    process.exit(1);
  }
  if (signal) {
    console.error(`spine-codex shim: child exited from signal ${signal}`);
    process.exit(1);
  }
  process.exit(status ?? 1);
});
