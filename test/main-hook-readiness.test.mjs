import assert from "node:assert/strict";
import test from "node:test";

import {
  createMainHookTimeoutError,
  waitForMainHookReady,
} from "../lib/main-hook-readiness.mjs";

const READY = Object.freeze({
  state: "ready",
  rendererRecovery: true,
  appServerReplayRecovery: true,
});

test("waits through a delayed 7-second startup without real time", async () => {
  const clock = virtualClock();
  const status = await waitForMainHookReady("unused", {
    timeoutMs: 5_000,
    progressGraceMs: 5_000,
    hardTimeoutMs: 12_000,
    finalGraceMs: 200,
    pollIntervalMs: 100,
    ...clock,
    readStatus: async () => {
      if (clock.now() < 4_500) {
        return { state: "installed", timestamp: "installed" };
      }
      if (clock.now() < 7_200) {
        return {
          state: "main-patched",
          timestamp: "main-patched",
          mainPatched: true,
        };
      }
      return READY;
    },
  });
  assert.equal(status, READY);
  assert.equal(clock.now(), 7_200);
});

test("progress uses a sliding deadline but never exceeds the hard cap", async () => {
  const clock = virtualClock();
  await assert.rejects(
    waitForMainHookReady("unused", {
      timeoutMs: 2_000,
      progressGraceMs: 4_000,
      hardTimeoutMs: 9_000,
      finalGraceMs: 500,
      pollIntervalMs: 100,
      ...clock,
      readStatus: async () => ({
        state: "main-patched",
        timestamp: String(Math.floor(clock.now() / 1_000)),
        mainPatched: true,
      }),
    }),
    /asynchronous initialization did not finish within 9s.*last state: main-patched/,
  );
  assert.equal(clock.now(), 9_000);
});

test("performs a final status read at the deadline boundary", async () => {
  const clock = virtualClock();
  const status = await waitForMainHookReady("unused", {
    timeoutMs: 100,
    progressGraceMs: 0,
    hardTimeoutMs: 100,
    finalGraceMs: 0,
    pollIntervalMs: 50,
    ...clock,
    readStatus: async () => clock.now() < 100
      ? { state: "installed", timestamp: "one" }
      : READY,
  });
  assert.equal(status, READY);
  assert.equal(clock.now(), 100);
});

test("allows a bounded final grace only after the preload progressed", async () => {
  const clock = virtualClock();
  const status = await waitForMainHookReady("unused", {
    timeoutMs: 100,
    progressGraceMs: 0,
    hardTimeoutMs: 200,
    finalGraceMs: 60,
    pollIntervalMs: 20,
    ...clock,
    readStatus: async () => clock.now() < 140
      ? { state: "version-patched", timestamp: "one", versionPatched: true }
      : READY,
  });
  assert.equal(status, READY);
  assert.equal(clock.now(), 140);
});

test("distinguishes an absent preload from partial initialization", async () => {
  const absentClock = virtualClock();
  await assert.rejects(
    waitForMainHookReady("unused", {
      timeoutMs: 100,
      hardTimeoutMs: 100,
      progressGraceMs: 0,
      finalGraceMs: 0,
      pollIntervalMs: 50,
      ...absentClock,
      readStatus: async () => {
        const error = new Error("missing");
        error.code = "ENOENT";
        throw error;
      },
    }),
    /main-process preload did not report startup.*may not have loaded the preload/,
  );

  const partial = createMainHookTimeoutError({
    lastState: "electron-integrations-installed",
    lastStatus: {
      state: "electron-integrations-installed",
      mainPatched: true,
      versionPatched: true,
      rendererRecovery: true,
      appServerReplayRecovery: false,
    },
    observedProgress: true,
    elapsedMs: 20_500,
  });
  assert.match(partial.message, /main-process hook loaded/);
  assert.match(partial.message, /pending: app-server replay recovery/);
  assert.doesNotMatch(partial.message, /preload.*did not report/);
});

test("fails closed for incompatible, malformed, and incomplete ready states", async () => {
  for (const [status, expected] of [
    [{ state: "incompatible", reason: "shape changed" }, /incompatible Codex bundle: shape changed/],
    [{ state: "ready", rendererRecovery: false, appServerReplayRecovery: true }, /did not install renderer crash recovery/],
    [{ state: "ready", rendererRecovery: true, appServerReplayRecovery: false }, /did not install app-server replay recovery/],
  ]) {
    const clock = virtualClock();
    await assert.rejects(
      waitForMainHookReady("unused", {
        timeoutMs: 100,
        hardTimeoutMs: 100,
        pollIntervalMs: 10,
        ...clock,
        readStatus: async () => status,
      }),
      expected,
    );
  }

  const clock = virtualClock();
  await assert.rejects(
    waitForMainHookReady("unused", {
      timeoutMs: 100,
      hardTimeoutMs: 100,
      pollIntervalMs: 10,
      ...clock,
      readStatus: async () => {
        throw new SyntaxError("Unexpected token } in JSON at position 4");
      },
    }),
    /Unexpected token/,
  );

  const nonObjectClock = virtualClock();
  await assert.rejects(
    waitForMainHookReady("unused", {
      timeoutMs: 100,
      hardTimeoutMs: 100,
      pollIntervalMs: 10,
      ...nonObjectClock,
      readStatus: async () => ["ready"],
    }),
    /status must be a JSON object/,
  );
});

function virtualClock() {
  let milliseconds = 0;
  return {
    now: () => milliseconds,
    sleep: async (duration) => { milliseconds += duration; },
  };
}
