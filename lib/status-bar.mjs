import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
export async function statusBarHelper(root) {
  for (const path of [
    join(
      root,
      "bin",
      "SpineCodex Status.app",
      "Contents",
      "MacOS",
      "spine-status-bar",
    ),
    join(
      root,
      ".build",
      "SpineCodex Status.app",
      "Contents",
      "MacOS",
      "spine-status-bar",
    ),
  ]) {
    try {
      await access(path, constants.X_OK);
      return path;
    } catch {}
  }
  throw new Error(
    "Native status bar helper missing. Run npm run build:statusbar.",
  );
}
export async function createStatusBar({ root, onAction }) {
  const path = await statusBarHelper(root);
  const child = spawn(
    path,
    process.env.SPINE_CODEX_STATUS_WINDOW === "1" ? ["--preview"] : [],
    { stdio: ["pipe", "pipe", "inherit"] },
  );
  let snapshot = {};
  let disposed = false;
  child.stdin.on("error", (error) => {
    if (!disposed) console.error(`Status bar: ${error.message}`);
  });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Status bar did not become ready")),
      5000,
    );
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    createInterface({ input: child.stdout }).on("line", (line) => {
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      if (event.action === "ready") {
        clearTimeout(timer);
        resolve();
      } else if (["switch", "restart", "quit"].includes(event.action))
        void onAction(event);
    });
    child.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("Status bar exited"));
    });
  });
  try {
    await ready;
  } catch (error) {
    child.kill();
    throw error;
  }
  return {
    update(value) {
      snapshot = { ...snapshot, ...value };
      if (!disposed && !child.stdin.destroyed)
        child.stdin.write(JSON.stringify(snapshot) + "\n");
    },
    dispose() {
      disposed = true;
      child.stdin.end();
    },
  };
}
export async function terminateDesktop({
  helper,
  child,
  appPath,
  timeoutMs = 15000,
}) {
  if (!child || child.exitCode != null || child.signalCode != null) return;
  await new Promise((resolve, reject) => {
    const command = spawn(helper, ["--terminate", String(child.pid), appPath], {
      stdio: "ignore",
    });
    command.once("error", reject);
    command.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error("Desktop could not be asked to quit; restart cancelled."),
          ),
    );
  });
  await new Promise((resolve, reject) => {
    if (child.exitCode != null || child.signalCode != null) return resolve();
    const timer = setTimeout(() => {
      child.removeListener("exit", done);
      reject(
        new Error(
          "Desktop is still running. Finish active work and retry; no second instance was started.",
        ),
      );
    }, timeoutMs);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    child.once("exit", done);
  });
}
