import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ModeController,
  readPreferences,
  savePreferences,
  matchCliBaseline,
} from "../lib/runtime-mode.mjs";
test("mode preferences persist without altering unrelated files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "spine-mode-"));
  try {
    const path = join(dir, "preferences.json");
    assert.equal((await readPreferences(path)).mode, process.platform === "darwin" ? "adapter" : "clone");
    await savePreferences("adapter", path);
    assert.equal((await readPreferences(path)).mode, "adapter");
    await assert.rejects(savePreferences("wrong", path));
    assert.equal(JSON.parse(await readFile(path)).mode, "adapter");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("switch stops old instance before starting another, then commits preference", async () => {
  const calls = [];
  const c = new ModeController({
    start: async (mode) => {
      calls.push("start:" + mode);
      return {
        stop: async () => {
          calls.push("stop:" + mode);
        },
      };
    },
    save: async (mode) => {
      calls.push("save:" + mode);
    },
  });
  await c.switchTo("clone", { persist: false });
  await c.switchTo("adapter");
  assert.deepEqual(calls, [
    "start:clone",
    "stop:clone",
    "start:adapter",
    "save:adapter",
  ]);
});
test("failed start restores previous mode and never saves broken preference", async () => {
  const calls = [];
  const c = new ModeController({
    start: async (mode) => {
      calls.push(mode);
      if (mode === "adapter") throw Error("broken");
      return { stop: async () => {} };
    },
    save: async () => assert.fail("must not save"),
  });
  await c.switchTo("clone", { persist: false });
  await assert.rejects(c.switchTo("adapter"), /broken/);
  assert.deepEqual(calls, ["clone", "adapter", "clone"]);
  assert.equal(c.mode, "clone");
  assert.ok(c.session);
});
test("failed stop cancels restart without losing the running session", async () => {
  let count = 0;
  const c = new ModeController({
    start: async () => {
      count++;
      return {
        stop: async () => {
          throw Error("busy Desktop");
        },
      };
    },
  });
  await c.switchTo("clone", { persist: false });
  const active = c.session;
  await assert.rejects(c.switchTo("adapter"), /busy Desktop/);
  assert.equal(count, 1);
  assert.equal(c.session, active);
});
test("concurrent mode clicks cannot start duplicate Desktop processes", async () => {
  let resolve;
  const c = new ModeController({
    start: () =>
      new Promise((r) => {
        resolve = r;
      }),
  });
  const first = c.switchTo("clone", { persist: false });
  assert.equal(await c.switchTo("adapter"), false);
  resolve({ stop: async () => {} });
  await first;
});
test("fork baseline requires both product and compatibility identities", () => {
  assert.equal(
    matchCliBaseline({
      productVersion: "0.4.1",
      compatibilityVersion: "0.153.4",
    }).kind,
    "fork",
  );
  assert.equal(
    matchCliBaseline({
      productVersion: "0.3.3",
      compatibilityVersion: "0.147.0",
    }).kind,
    "official",
  );
  assert.equal(
    matchCliBaseline({
      productVersion: "0.4.1",
      compatibilityVersion: "0.147.0",
    }),
    null,
  );
});
