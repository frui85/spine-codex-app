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
