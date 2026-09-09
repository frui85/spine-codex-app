import { readFile } from "node:fs/promises";

export const MAIN_HOOK_PROGRESS_STATES = new Set([
  "installed",
  "main-patched",
  "version-patched",
  "electron-integrations-installed",
]);

export async function waitForMainHookReady(statusPath, options = {}) {
  const {
    timeoutMs = 20_000,
    progressGraceMs = 10_000,
    hardTimeoutMs = 30_000,
    finalGraceMs = 500,
    pollIntervalMs = 50,
    now = Date.now,
    sleep = defaultSleep,
    readStatus = readMainHookStatus,
  } = options;
  validateTimingOption("timeoutMs", timeoutMs, 1);
  validateTimingOption("progressGraceMs", progressGraceMs, 0);
  validateTimingOption("hardTimeoutMs", hardTimeoutMs, timeoutMs);
  validateTimingOption("finalGraceMs", finalGraceMs, 0);
  validateTimingOption("pollIntervalMs", pollIntervalMs, 1);

  const startedAt = now();
  const hardDeadline = startedAt + hardTimeoutMs;
  let deadline = Math.min(startedAt + timeoutMs, hardDeadline);
  let lastStatus = null;
  let lastState = "not reported";
  let lastProgressKey = null;
  let observedProgress = false;

  const inspect = async () => {
    const status = await readStatusSafely(statusPath, readStatus);
    if (status == null) return null;
    if (typeof status !== "object" || Array.isArray(status)) {
      throw new Error("main-process hook status must be a JSON object");
    }
    lastStatus = status;
    lastState = typeof status.state === "string" ? status.state : "invalid";
    validateTerminalStatus(status);

    if (MAIN_HOOK_PROGRESS_STATES.has(lastState)) {
      observedProgress = true;
      const progressKey = `${lastState}:${status.timestamp ?? ""}`;
      if (progressKey !== lastProgressKey) {
        lastProgressKey = progressKey;
        deadline = Math.min(
          hardDeadline,
          Math.max(deadline, now() + progressGraceMs),
        );
      }
    }
    return status;
  };

  while (now() < deadline) {
    const status = await inspect();
    if (status?.state === "ready") return status;
    const remaining = deadline - now();
    if (remaining > 0) await sleep(Math.min(pollIntervalMs, remaining));
  }

  // Read once more at the boundary so a final atomic status write cannot lose
  // a race with the polling deadline. If the preload demonstrably progressed,
  // allow one bounded quiet period before surfacing an initialization timeout.
  let status = await inspect();
  if (status?.state === "ready") return status;
  if (observedProgress && finalGraceMs > 0 && now() < hardDeadline) {
    const graceDeadline = Math.min(hardDeadline, now() + finalGraceMs);
    while (now() < graceDeadline) {
      await sleep(Math.min(pollIntervalMs, graceDeadline - now()));
      status = await inspect();
      if (status?.state === "ready") return status;
    }
  }

  throw createMainHookTimeoutError({
    lastState,
    lastStatus,
    observedProgress,
    elapsedMs: Math.max(0, now() - startedAt),
  });
}

export async function readMainHookStatus(statusPath) {
  return JSON.parse(await readFile(statusPath, "utf8"));
}

export function createMainHookTimeoutError({
  lastState,
  lastStatus,
  observedProgress,
  elapsedMs,
}) {
  const elapsedSeconds = formatSeconds(elapsedMs);
  if (observedProgress) {
    const pending = describePendingReadiness(lastStatus);
    return new Error(
      "SpineCodex main-process hook loaded, but asynchronous initialization " +
        `did not finish within ${elapsedSeconds}s (last state: ${lastState}; ` +
        `pending: ${pending}). Quit Codex completely and retry. If this ` +
        "persists, run spine-app --diagnose and report the Desktop build.",
    );
  }
  if (lastState === "not reported") {
    return new Error(
      "SpineCodex main-process preload did not report startup within " +
        `${elapsedSeconds}s. The Desktop process may not have loaded the ` +
        "preload. Quit Codex completely and retry, then run " +
        "spine-app --diagnose if the problem persists.",
    );
  }
  return new Error(
    "SpineCodex main-process hook reported an unexpected startup state " +
      `within ${elapsedSeconds}s (last state: ${lastState}). Quit Codex ` +
      "completely and retry, then run spine-app --diagnose if the problem persists.",
  );
}

function validateTerminalStatus(status) {
  if (status.state === "ready") {
    if (status.rendererRecovery !== true) {
      throw new Error(
        "the main-process hook did not install renderer crash recovery",
      );
    }
    if (status.appServerReplayRecovery !== true) {
      throw new Error(
        "the main-process hook did not install app-server replay recovery",
      );
    }
  }
  if (status.state === "incompatible") {
    throw new Error(
      `incompatible Codex bundle: ${status.reason ?? "unknown structure"}`,
    );
  }
}

async function readStatusSafely(statusPath, readStatus) {
  try {
    return await readStatus(statusPath);
  } catch (error) {
    if (
      error?.code === "ENOENT" ||
      /Unexpected end of JSON input/.test(error?.message ?? "")
    ) {
      return null;
    }
    throw error;
  }
}

function describePendingReadiness(status) {
  if (status == null) return "status update";
  const pending = [];
  if (status.mainPatched !== true && status.state !== "main-patched") {
    pending.push("main bundle patch");
  }
  if (status.versionPatched !== true && status.state !== "version-patched") {
    pending.push("version bundle patch");
  }
  if (status.rendererRecovery !== true) pending.push("renderer recovery");
  if (status.appServerReplayRecovery !== true) {
    pending.push("app-server replay recovery");
  }
  return pending.length > 0 ? pending.join(", ") : "ready status write";
}

function formatSeconds(milliseconds) {
  return (milliseconds / 1_000).toFixed(milliseconds % 1_000 === 0 ? 0 : 1);
}

function validateTimingOption(name, value, minimum) {
  if (!Number.isFinite(value) || value < minimum) {
    throw new TypeError(`${name} must be a finite number >= ${minimum}`);
  }
}

function defaultSleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
