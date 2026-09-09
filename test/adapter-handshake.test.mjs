import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAdapterHandshake,
  waitForAdapter,
} from "../lib/adapter-handshake.mjs";
test("only correlated successful initialize proves Desktop reached adapter", async () => {
  const dir = await mkdtemp(join(tmpdir(), "spine-handshake-"));
  const path = join(dir, "status.json");
  try {
    const h = createAdapterHandshake(path);
    h.client('{"id":3,"method":"initialize"}');
    h.server('{"id":2,"result":{}}');
    h.server('{"id":3,"error":{}}');
    await assert.rejects(readFile(path), { code: "ENOENT" });
    h.server('{"id":3,"result":{}}');
    assert.equal((await waitForAdapter(path)).state, "initialized");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("Desktop exit cannot report an adapter as ready", async () => {
  await assert.rejects(
    waitForAdapter("/unused", { isRunning: () => false }),
    /did not initialize/,
  );
});
