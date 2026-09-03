import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  injectMainProcessHook,
  validateInspectorWebSocketUrl,
  waitForInspectorTarget,
} from "../lib/main-inspector.mjs";

test("injects a CommonJS hook before an inspected main script resumes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "spine inspector (fixture) "));
  const hookDirectory = join(directory, "hook with spaces");
  const hookPath = join(hookDirectory, "probe.cjs");
  await mkdir(hookDirectory, { recursive: true });
  await writeFile(
    hookPath,
    'globalThis.__spineInspectorProbe = "injected-before-main";\n',
    "utf8",
  );
  const port = await reservePort();
  const child = spawn(process.execPath, [
    `--inspect-brk=127.0.0.1:${port}`,
    "-e",
    'console.log(globalThis.__spineInspectorProbe ?? "missing")',
  ], { stdio: ["ignore", "pipe", "pipe"] });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));

  try {
    const result = await injectMainProcessHook({
      port,
      hookPath,
      timeoutMs: 5_000,
    });
    assert.equal(result.loaded, true);
    const status = await new Promise((resolve, reject) => {
      child.once("exit", resolve);
      child.once("error", reject);
    });
    assert.equal(status, 0, Buffer.concat(stderr).toString());
    assert.equal(Buffer.concat(stdout).toString().trim(), "injected-before-main");
  } finally {
    if (child.exitCode == null) child.kill();
    await rm(directory, { recursive: true, force: true });
  }
});

test("enables a runtime Inspector after a fuse-off style launch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "spine inspector runtime "));
  const hookPath = join(directory, "probe.cjs");
  const entryPath = join(directory, "entry.cjs");
  await writeFile(
    hookPath,
    'globalThis.__spineInspectorProbe = "runtime-injected";\n',
    "utf8",
  );
  await writeFile(
    entryPath,
    'const until = Date.now() + 10_000; while (Date.now() < until) {}\nsetInterval(() => {}, 1000);\n',
    "utf8",
  );
  const port = await reservePort();
  const child = spawn(process.execPath, [
    `--inspect-port=127.0.0.1:${port}`,
    entryPath,
  ], { stdio: ["ignore", "pipe", "pipe"] });

  try {
    await new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    child.kill("SIGUSR1");
    const result = await injectMainProcessHook({
      port,
      expectedPid: child.pid,
      hookPath,
      timeoutMs: 5_000,
    });
    assert.equal(result.loaded, true);
  } finally {
    if (child.exitCode == null) child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects a non-loopback or wrong-port Inspector target", () => {
  assert.throws(
    () => validateInspectorWebSocketUrl("ws://192.0.2.1:9229/id", 9229),
    /unsafe/,
  );
  assert.throws(
    () => validateInspectorWebSocketUrl("ws://127.0.0.1:9230/id", 9229),
    /unsafe/,
  );
  assert.equal(
    validateInspectorWebSocketUrl("ws://127.0.0.1:9229/id", 9229),
    "ws://127.0.0.1:9229/id",
  );
});

test("explains when the Desktop Inspector endpoint is unavailable", async () => {
  await assert.rejects(
    waitForInspectorTarget(39999, {
      timeoutMs: 20,
      fetchImpl: async () => {
        throw new Error("fetch failed");
      },
    }),
    /127\.0\.0\.1:39999: fetch failed.*nodeCliInspect fuse is off/,
  );
});

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}
