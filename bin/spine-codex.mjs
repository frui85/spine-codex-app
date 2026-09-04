#!/usr/bin/env node

import { spawn } from "node:child_process";
import { constants, realpathSync } from "node:fs";
import { accessSync } from "node:fs";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAppServerOutputFilter } from "../lib/app-server-output-filter.mjs";
import { createAppServerProtocolAdapter } from "../lib/app-server-protocol-adapter.mjs";

const adapterName = basename(process.argv[1] ?? "spine-codex-app-adapter");
const binary = process.env.SPINE_CODEX_BINARY || findSpineCodexBinary();
if (!binary) {
  console.error(
    `${adapterName}: unable to find the real spine-codex executable; ` +
    "set SPINE_CODEX_BINARY or install spine-codex in PATH",
  );
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
  stdio: filtersAppServerOutput ? ["pipe", "pipe", "inherit"] : "inherit",
  windowsHide: true,
});

let outputDrained = Promise.resolve();
if (filtersAppServerOutput) {
  const serverWriter = createBufferedLineWriter(child.stdin);
  let reportedSuppression = false;
  const reportedFallbacks = new Set();
  const filter = createAppServerOutputFilter({
    onSuppressed() {
      if (reportedSuppression) return;
      reportedSuppression = true;
      console.error(
        `${adapterName}: suppressed duplicate app/list/updated notifications`,
      );
    },
  });
  const clientWriter = createBufferedLineWriter(filter);
  const adapter = createAppServerProtocolAdapter({
    writeToServer: serverWriter.write,
    writeToClient: clientWriter.write,
    onIdle: serverWriter.end,
    onLegacyFallback(method) {
      if (reportedFallbacks.has(method)) return;
      reportedFallbacks.add(method);
      console.error(
        `${adapterName}: using legacy app/list compatibility for ${method}`,
      );
    },
  });
  outputDrained = new Promise((resolve, reject) => {
    filter.once("end", resolve);
    filter.once("error", reject);
    child.stdout.once("error", reject);
    child.stdin.once("error", reject);
  });
  filter.pipe(process.stdout, { end: false });
  consumeLines(process.stdin, adapter.acceptClientLine, adapter.endClientInput);
  consumeLines(child.stdout, adapter.acceptServerLine, () => clientWriter.end());
}

child.once("error", (error) => {
  console.error(`${adapterName}: ${error.message}`);
  process.exit(1);
});
child.once("exit", async (status, signal) => {
  try {
    await outputDrained;
  } catch (error) {
    console.error(`${adapterName}: stdout filter failed: ${error.message}`);
    process.exit(1);
  }
  if (signal) {
    console.error(`${adapterName}: child exited from signal ${signal}`);
    process.exit(1);
  }
  process.exit(status ?? 1);
});

function findSpineCodexBinary() {
  const ownDirectory = dirname(fileURLToPath(import.meta.url));
  const executableNames = process.platform === "win32"
    ? ["spine-codex.exe", "spine-codex.cmd", "spine-codex.bat", "spine-codex"]
    : ["spine-codex"];
  const directories = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  if (process.platform !== "win32") {
    directories.push(
      "/opt/homebrew/bin",
      "/usr/local/bin",
    );
    if (process.env.HOME) {
      directories.push(
        join(process.env.HOME, ".local", "bin"),
        join(process.env.HOME, ".npm-global", "bin"),
        join(process.env.HOME, ".volta", "bin"),
      );
    }
  }

  const seen = new Set();
  for (const directory of directories) {
    if (!directory) continue;
    for (const name of executableNames) {
      const candidate = resolve(directory, name);
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      // Release bundles keep the legacy shim beside the new adapter. Never
      // rediscover that shim and recurse back into this module.
      if (dirname(candidate) === ownDirectory) continue;
      try {
        accessSync(
          candidate,
          process.platform === "win32" ? constants.F_OK : constants.X_OK,
        );
        const realCandidate = realpathSync(candidate);
        if (dirname(realCandidate) === ownDirectory) continue;
        return candidate;
      } catch {}
    }
  }
  return null;
}

function consumeLines(stream, onLine, onEnd) {
  let buffered = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffered += chunk;
    let newlineIndex;
    while ((newlineIndex = buffered.indexOf("\n")) !== -1) {
      const line = buffered.slice(0, newlineIndex);
      buffered = buffered.slice(newlineIndex + 1);
      if (line.length > 0) onLine(line);
    }
  });
  stream.once("end", () => {
    if (buffered.length > 0) onLine(buffered);
    onEnd();
  });
}

function createBufferedLineWriter(stream) {
  const queued = [];
  let blocked = false;
  let ending = false;

  const finishIfReady = () => {
    if (ending && !blocked && queued.length === 0) stream.end();
  };

  const flush = () => {
    blocked = false;
    while (queued.length > 0 && !blocked) {
      blocked = !stream.write(`${queued.shift()}\n`);
    }
    finishIfReady();
  };

  stream.on("drain", flush);
  return {
    write(line) {
      if (ending) throw new Error("cannot write after stream end");
      if (blocked) queued.push(line);
      else blocked = !stream.write(`${line}\n`);
    },
    end() {
      ending = true;
      finishIfReady();
    },
  };
}
