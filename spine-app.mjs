#!/usr/bin/env node
import { access, readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { accessSync, constants } from "node:fs";
import { createServer } from "node:net";
import { createHash } from "node:crypto";
import { homedir, release as osRelease, tmpdir } from "node:os";
import {
  basename,
  delimiter,
  dirname,
  extname,
  isAbsolute,
  join,
  resolve,
} from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inspectDesktopBundleContract } from "./lib/desktop-bundle-contract.mjs";
import { injectMainProcessHook } from "./lib/main-inspector.mjs";
import {
  CLONE_DISABLE_ENV,
  isCloneDisabled,
  prepareInspectableDesktopClone,
  readFuseState,
  resolveCloneRoot,
} from "./lib/macos-inspector-clone.mjs";
import { waitForMainHookReady } from "./lib/main-hook-readiness.mjs";
import {
  compareVersions,
  inspectSpineCodexIdentity,
  parseCliVersion,
  probeAppsProtocol,
} from "./lib/spine-codex-compatibility.mjs";

import {
  createMacShellEnvironment,
  verifyLocalAdapter,
} from "./lib/mac-shell-environment.mjs";
import {
  superviseRenderer,
  isMainRendererTarget,
} from "./lib/renderer-supervisor.mjs";
import {
  createStatusBar,
  statusBarHelper,
  terminateDesktop,
} from "./lib/status-bar.mjs";
import {
  ModeController,
  MODE_LABELS,
  validateMode,
  readPreferences,
  matchCliBaseline,
} from "./lib/runtime-mode.mjs";
import { waitForAdapter } from "./lib/adapter-handshake.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const APP_VERSION = "26.901.51231.1";
const LOCAL_CLI_DIR = join(HERE, "bin");
const LOCAL_CLI_SHIM = join(
  LOCAL_CLI_DIR,
  process.platform === "win32" ? "spine-codex.exe" : "spine-codex",
);
const ELECTRON_MAIN_HOOK = join(HERE, "spine-electron-main-hook.cjs");
const REMOTE_CLI_NAME = "spine-codex";
const MIN_SPINE_CODEX_VERSION = "0.2.2";
const RECOMMENDED_SPINE_CODEX_VERSION = "0.3.3";
const VALIDATED_CODEX_COMPATIBILITY_VERSION = "0.147.0";
const VALIDATED_DESKTOP_VERSIONS = [
  "26.810.41047",
  "26.818.41509",
  "26.825.51511",
  "26.901.20858",
  "26.901.51231",
];
const MIN_NODE_VERSION = "22.0.0";
const MIN_MACOS_VERSION = "14.0.0";
const MIN_WINDOWS_VERSION = "10.0.17763";
const CODEX_DOWNLOAD_URL = "https://chatgpt.com/download/";
const SPINE_CODEX_INSTALL_COMMAND =
  "npm install -g @spinejit/spine-codex@latest";
const NODE_OPTIONS_FUSE_INDEX = 2;
const NODE_CLI_INSPECT_FUSE_INDEX = 3;
// The first execution of a freshly signed Desktop clone waits for AMFI to
// validate the ad-hoc signed Electron framework before the paused main
// process opens its Inspector; that took about 7 s on Apple silicon, so the
// budget leaves room for slower disks and Intel machines.
const MAIN_INSPECTOR_TIMEOUT_MS = 60_000;
const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`Usage: spine-app [OPTIONS] [PATH]

Launch Codex Desktop with the installed SpineCodex backend and a lightweight
Spine Tree section embedded in Codex's native summary panel. Connected SSH
hosts use their own spine-codex command instead of codex.

Options:
  --spine-codex PATH  SpineCodex binary (default: resolve from PATH)
  --app PATH          Codex executable or macOS app bundle (default: auto-detect)
  --mode MODE         clone (default), adapter, or auto (clone with fallback)
  --no-tray           Run without the macOS status bar
  --user-data-dir DIR Use a separate Desktop profile (for isolated validation)
  --diagnose          Check every prerequisite without launching the app
  --json              Emit stable JSON output with --diagnose
  -V, --version       Print the wrapper version
  -h, --help          Show this help`);
  process.exit(0);
}

if (args.version) {
  console.log(`spine-app ${APP_VERSION}`);
  process.exit(0);
}

args.mode ??= (await readPreferences()).mode;
if (process.platform !== "darwin" && args.mode !== "clone")
  fail("Adapter and auto modes currently require macOS.");

if (args.diagnose) {
  let diagnosis = await diagnose({
    ...args,
    mode: args.mode === "auto" ? "clone" : args.mode,
  });
  if (!diagnosis.ok && args.mode === "auto")
    diagnosis = await diagnose({ ...args, mode: "adapter" });
  if (args.json) printDiagnosisJson(diagnosis);
  else printDiagnosis(diagnosis);
  process.exit(diagnosis.ok ? 0 : 1);
}
await runManagedApp();

async function startSession(diagnosis, mode, onHealth) {
  const {
    spineCodex,
    appPath,
    versionOutput,
    commandSearchPath,
    versionIdentity,
    rendererSource: RENDERER_SOURCE,
  } = diagnosis;
  const localIdentityJson = JSON.stringify({
    mode: versionIdentity.mode,
    productVersion: versionIdentity.productVersion,
    compatibilityVersion: versionIdentity.compatibilityVersion,
  });
  const SCRIPT =
    `globalThis.__spineCodexRuntimeMode=${JSON.stringify(mode)};\n` +
    prependRendererIdentity(RENDERER_SOURCE, localIdentityJson);

  if (!args.userDataDir && isAppRunning(appPath)) {
    throw new Error(
      "Codex Desktop is running. Quit it completely, then run spine-app again.",
    );
  }

  const sessionDirectory = await mkdtemp(join(tmpdir(), "spine-session-"));
  let shellEnvironment = null;
  let launchedApp = null;
  let supervisor = null;
  let stopped = false;
  let stopping = false;
  const abort = new AbortController();
  const isRunning = () =>
    launchedApp != null &&
    launchedApp.exitCode == null &&
    launchedApp.signalCode == null;
  const cleanup = async () => {
    if (stopped) return;
    stopped = true;
    abort.abort();
    await supervisor?.catch(() => {});
    await shellEnvironment?.dispose();
    await rm(sessionDirectory, { recursive: true, force: true });
  };
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    try {
      if (isRunning()) {
        if (process.platform === "darwin") {
          const helper = await statusBarHelper(HERE);
          await terminateDesktop({
            helper,
            child: launchedApp,
            appPath: launchAppPath,
          });
        } else {
          launchedApp.kill();
        }
      }
      await cleanup();
    } finally {
      stopping = false;
    }
  };
  let launchAppPath = appPath;
  try {
    const debugPort = await reservePort();
    const mainInspectorPort =
      mode !== "adapter" && needsMainProcessInspector(diagnosis)
        ? await reservePort()
        : null;
    const mainHookStatusPath = join(
      sessionDirectory,
      `spine-codex-main-hook-${process.pid}-${debugPort}.json`,
    );
    const deepLink =
      args.workspace == null
        ? null
        : `codex://threads/new?path=${encodeURIComponent(resolve(process.cwd(), args.workspace))}`;
    const appSearchPath = [LOCAL_CLI_DIR, commandSearchPath]
      .filter(Boolean)
      .join(delimiter);
    const mainHookOption =
      process.platform === "win32"
        ? `--require "${ELECTRON_MAIN_HOOK.replaceAll('"', '\\"')}"`
        : `--require ${JSON.stringify(ELECTRON_MAIN_HOOK)}`;
    const nodeOptions = [mainHookOption, process.env.NODE_OPTIONS]
      .filter(Boolean)
      .join(" ");
    const appEnvironment = {
      ...process.env,
      PATH: appSearchPath,
      // Remote SSH must receive a portable command name. The verified Electron
      // hook independently points only the local selector at the private shim, so
      // a login-shell PATH refresh cannot bypass the output filter.
      CODEX_CLI_PATH: REMOTE_CLI_NAME,
      SPINE_CODEX_LOCAL_CLI_PATH: LOCAL_CLI_SHIM,
      SPINE_CODEX_BINARY: spineCodex,
      SPINE_CODEX_SHIM_NODE: process.execPath,
      SPINE_CODEX_MIN_VERSION: MIN_SPINE_CODEX_VERSION,
      SPINE_CODEX_MAIN_HOOK_STATUS: mainHookStatusPath,
      SPINE_CODEX_LOCAL_IDENTITY_JSON: localIdentityJson,
      SPINE_CODEX_RENDERER_PATH: join(HERE, "spine-view.js"),
      SPINE_CODEX_RENDERER_SHA256: createHash("sha256")
        .update(RENDERER_SOURCE)
        .digest("hex"),
      NODE_OPTIONS: mode === "adapter" ? "" : nodeOptions,
      SPINE_CODEX_ADAPTER_STATUS: join(sessionDirectory, "adapter.json"),
    };
    if (mode === "adapter") {
      shellEnvironment = await createMacShellEnvironment(LOCAL_CLI_DIR);
      Object.assign(appEnvironment, shellEnvironment.env);
      await verifyLocalAdapter(LOCAL_CLI_SHIM, appEnvironment);
    }
    if (mode !== "adapter" && diagnosis.inspectableClone?.required) {
      process.stdout.write("Preparing inspectable Codex Desktop clone… ");
      const startedAt = Date.now();
      try {
        const clone = await prepareInspectableDesktopClone({
          appPath,
          cloneRoot: diagnosis.inspectableClone.root,
        });
        launchAppPath = clone.appPath;
        console.log(
          clone.reused
            ? "reused."
            : `created in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`,
        );
      } catch (error) {
        throw new Error(
          "could not prepare an inspectable Codex Desktop clone; Codex was not " +
            `started: ${error.message}`,
        );
      }
    }
    launchedApp = await launchCodexApp({
      appPath: launchAppPath,
      deepLink,
      debugPort,
      mainInspectorPort,
      appEnvironment,
    });

    if (mainInspectorPort != null) {
      process.stdout.write("Injecting SpineCodex into Codex main process… ");
      try {
        await injectMainProcessHook({
          port: mainInspectorPort,
          fallbackPorts: process.platform === "darwin" ? [9229] : [],
          expectedPid: launchedApp?.pid ?? null,
          hookPath: ELECTRON_MAIN_HOOK,
          timeoutMs: MAIN_INSPECTOR_TIMEOUT_MS,
        });
      } catch (error) {
        throw new Error(
          "Codex main-process injection failed; Codex was not allowed to " +
            `continue unpatched: ${error.message}. ` +
            "The launcher will request a graceful stop before any fallback.",
        );
      }
      console.log("ready.");
    }

    if (mode === "adapter") {
      process.stdout.write(
        "Waiting for Desktop adapter initialize and renderer… ",
      );
      let resolveReady, rejectReady;
      const rendererReady = new Promise((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
      });
      supervisor = superviseRenderer({
        port: debugPort,
        rendererSource: SCRIPT,
        signal: abort.signal,
        isDesktopRunning: isRunning,
        onReady: resolveReady,
        onHealth,
      });
      supervisor.then(
        () =>
          rejectReady(new Error("Desktop exited before renderer readiness")),
        rejectReady,
      );
      await Promise.all([
        rendererReady,
        waitForAdapter(appEnvironment.SPINE_CODEX_ADAPTER_STATUS, {
          isRunning,
        }),
      ]);
    } else {
      process.stdout.write(
        "Waiting for Codex renderer and main-process hook… ",
      );
      const [target] = await Promise.all([
        waitForTarget(debugPort),
        waitForMainHookReady(mainHookStatusPath, {
          timeoutMs: 20_000,
          progressGraceMs: 10_000,
          hardTimeoutMs: 30_000,
          finalGraceMs: 500,
        }),
      ]);
      await inject(target.webSocketDebuggerUrl, debugPort, SCRIPT);
    }
    console.log("Spine Tree ready.");
    const baseline = matchCliBaseline(versionIdentity);
    const done = new Promise((resolve) => {
      if (!isRunning()) resolve();
      else launchedApp.once("exit", resolve);
    });
    return {
      stop,
      cleanup,
      done,
      info: {
        activeMode: mode,
        activeModeLabel: MODE_LABELS[mode],
        desktopVersion: diagnosis.desktopVersion,
        productVersion: versionIdentity.productVersion ?? "未知",
        compatibilityVersion: versionIdentity.compatibilityVersion,
        baselineLabel: baseline
          ? baseline.label + "（按版本匹配）"
          : "当前 CLI 组合尚未回归",
        desktopStatus:
          diagnosis.desktopVersion ===
          APP_VERSION.split(".").slice(0, 3).join(".")
            ? "Desktop 与 App 目标版本匹配"
            : "Desktop 非本次发布目标版本",
        note:
          mode === "adapter"
            ? "历史恢复与 SSH 增强：仅副本模式提供"
            : "历史恢复与 SSH 增强：已启用",
      },
    };
  } catch (error) {
    try {
      await stop();
    } catch (stopError) {
      throw new Error(`${error.message}; cleanup failed: ${stopError.message}`);
    }
    throw error;
  }
}

async function runManagedApp() {
  if (process.platform === "darwin" && !args.userDataDir && isAppRunning(null)) {
    fail("Codex Desktop is running. Quit it completely, then run spine-app again.");
  }
  if (process.platform === "darwin") await statusBarHelper(HERE);
  let tray = null;
  let shuttingDown = false;
  let finish;
  const closed = new Promise((resolve) => {
    finish = resolve;
  });
  const controller = new ModeController({
    onState: (state) => tray?.update(state),
    start: async (requestedMode) => {
      const modes =
        requestedMode === "auto" ? ["clone", "adapter"] : [requestedMode];
      let lastError;
      for (const mode of modes) {
        const diagnosis = await diagnose({ ...args, mode });
        if (!diagnosis.ok) {
          lastError = new Error(
            diagnosis.checks
              .filter((c) => c.status === "error")
              .map((c) => `${c.label}: ${c.detail}`)
              .join("\n"),
          );
          continue;
        }
        tray?.update({
          error: "",
          note: "",
          status: `正在启动${MODE_LABELS[mode]}…`,
          activeModeLabel: MODE_LABELS[mode],
          desktopVersion: diagnosis.desktopVersion,
        });
        try {
          const session = await startSession(
            diagnosis,
            mode,
            (health, detail) =>
              tray?.update({
                status:
                  health === "ready"
                    ? "Renderer 已连接"
                    : "正在恢复 Renderer 连接…",
                error: detail ?? "",
              }),
          );
          if (lastError) {
            session.info.note = `自动兜底：${lastError.message.slice(0, 80)}`;
            console.log(`Automatic fallback to adapter: ${lastError.message}`);
          }
          session.done.then(async () => {
            // During a controlled switch, the old process exit belongs to the
            // transaction. It must not terminate the new launcher or shell.
            while (controller.busy && !shuttingDown)
              await new Promise((resolve) => setTimeout(resolve, 50));
            if (controller.session !== session || shuttingDown) return;
            await session.cleanup();
            tray?.dispose();
            finish();
          });
          return session;
        } catch (error) {
          lastError = error;
          if (!args.userDataDir && isAppRunning(diagnosis.appPath)) throw error;
          if (modes.length > 1)
            tray?.update({
              status: "副本启动失败，尝试外部适配器…",
              error: error.message,
            });
        }
      }
      throw lastError;
    },
  });
  if (process.platform === "darwin" && !args.noTray) {
    tray = await createStatusBar({
      root: HERE,
      onAction: async (event) => {
        try {
          if (event.action === "quit") {
            if (await controller.quit()) {
              shuttingDown = true;
              tray.dispose();
              finish();
            }
          } else {
            await controller.switchTo(
              event.action === "switch" ? event.mode : controller.mode,
            );
          }
        } catch (error) {
          tray.update({ busy: false, error: error.message });
          console.error(error.message);
        }
      },
    });
    tray.update({
      appVersion: APP_VERSION,
      requestedMode: args.mode,
      busy: true,
      status: "检查兼容性…",
    });
  }
  const quit = async () => {
    try {
      if (await controller.quit()) {
        shuttingDown = true;
        tray?.dispose();
        finish();
      }
    } catch (error) {
      console.error(error.message);
      tray?.update({ error: error.message });
    }
  };
  process.on("SIGINT", quit);
  process.on("SIGTERM", quit);
  try {
    await controller.switchTo(args.mode, { persist: false });
  } catch (error) {
    if (!tray) throw error;
    console.error(error.message);
  }
  // Preserve the original one-shot CLI behavior when no tray or external
  // supervisor was requested. Do not extend the detached Desktop lifetime.
  if (args.noTray && controller.session?.info.activeMode === "clone") {
    await controller.session.cleanup();
  } else {
    await closed;
  }
  process.removeListener("SIGINT", quit);
  process.removeListener("SIGTERM", quit);
}

function parseArgs(values) {
  const parsed = {
    workspace: null,
    spineCodex: null,
    app: null,
    diagnose: false,
    json: false,
    version: false,
    help: false,
    mode: null,
    noTray: false,
    userDataDir: null,
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "-h" || value === "--help") parsed.help = true;
    else if (value === "-V" || value === "--version") parsed.version = true;
    else if (value === "--user-data-dir")
      parsed.userDataDir = resolve(requiredValue(values, ++index, value));
    else if (value === "--mode")
      parsed.mode = validateMode(requiredValue(values, ++index, value));
    else if (value === "--no-tray") parsed.noTray = true;
    else if (value === "--diagnose") parsed.diagnose = true;
    else if (value === "--json") parsed.json = true;
    else if (value === "--spine-codex")
      parsed.spineCodex = requiredValue(values, ++index, value);
    else if (value === "--app")
      parsed.app = requiredValue(values, ++index, value);
    else if (value.startsWith("-")) fail(`unknown option: ${value}`);
    else parsed.workspace = value;
  }
  if (parsed.json && !parsed.diagnose) fail("--json requires --diagnose");
  return parsed;
}

function needsMainProcessInspector(currentDiagnosis) {
  if (process.platform === "win32") return true;
  return (
    process.platform === "darwin" && currentDiagnosis.nodeOptionsFuse !== "on"
  );
}

function requiredValue(values, index, option) {
  if (!values[index]) fail(`${option} requires a value`);
  return values[index];
}

function prependRendererIdentity(source, identityJson) {
  return (
    `Object.defineProperty(globalThis, "__spineCodexLocalIdentityV1", {` +
    `value: Object.freeze(${identityJson}), configurable: true});\n` +
    source
  );
}

function findExecutable(name, searchPath = process.env.PATH ?? "") {
  const extensions =
    process.platform === "win32" && extname(name) === ""
      ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM")
          .split(";")
          .filter(Boolean)
      : [""];
  for (const directory of searchPath.split(delimiter)) {
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = join(directory, `${name}${extension}`);
      try {
        accessSync(
          candidate,
          process.platform === "win32" ? constants.F_OK : constants.X_OK,
        );
        return candidate;
      } catch {}
    }
  }
  return null;
}

function runExecutableSync(command, commandArgs, options) {
  const commandScript =
    process.platform === "win32" && /\.(?:cmd|bat)$/i.test(command);
  return spawnSync(command, commandArgs, {
    ...options,
    shell: commandScript,
    windowsHide: true,
  });
}

async function diagnose(options) {
  const checks = [];
  const add = (status, label, detail, remedy = null) => {
    checks.push({ status, label, detail, remedy });
  };

  if (process.platform === "darwin") {
    const macos = spawnSync("/usr/bin/sw_vers", ["-productVersion"], {
      encoding: "utf8",
    }).stdout?.trim();
    const parsedMacos = parseSystemVersion(macos);
    if (parsedMacos && compareVersions(parsedMacos, MIN_MACOS_VERSION) < 0) {
      add(
        "error",
        "Platform",
        `macOS ${parsedMacos} is older than required ${MIN_MACOS_VERSION}`,
        "Upgrade macOS before installing the current ChatGPT desktop app.",
      );
    } else {
      add("ok", "Platform", `macOS${macos ? ` ${macos}` : ""}`);
    }
  } else if (process.platform === "win32") {
    const windows = parseSystemVersion(osRelease());
    if (windows && compareVersions(windows, MIN_WINDOWS_VERSION) < 0) {
      add(
        "error",
        "Platform",
        `Windows ${windows} is older than required ${MIN_WINDOWS_VERSION}`,
        "Upgrade Windows before installing the current ChatGPT desktop app.",
      );
    } else {
      add("ok", "Platform", `Windows${windows ? ` ${windows}` : ""}`);
    }
  } else {
    add(
      "error",
      "Platform",
      `${process.platform} is unsupported`,
      "This release supports macOS and Windows x64.",
    );
  }

  const nodeVersion = parseCliVersion(process.versions.node);
  if (nodeVersion && compareVersions(nodeVersion, MIN_NODE_VERSION) >= 0) {
    add("ok", "Node.js", process.version);
  } else {
    add(
      "error",
      "Node.js",
      `${process.version} is older than ${MIN_NODE_VERSION}`,
      "Install Node.js 22 or newer from https://nodejs.org/",
    );
  }

  let rendererSource = null;
  let rendererInfo = null;
  try {
    rendererSource = await readFile(join(HERE, "spine-view.js"), "utf8");
    await access(
      LOCAL_CLI_SHIM,
      process.platform === "win32" ? constants.F_OK : constants.X_OK,
    );
    await access(ELECTRON_MAIN_HOOK, constants.R_OK);
    rendererInfo = {
      path: join(HERE, "spine-view.js"),
      bytes: Buffer.byteLength(rendererSource),
      sha256: createHash("sha256").update(rendererSource).digest("hex"),
    };
    add(
      "ok",
      "Wrapper files",
      `${Buffer.byteLength(rendererSource)} byte renderer`,
    );
  } catch (error) {
    add(
      "error",
      "Wrapper files",
      error.code === "ENOENT" ? "the release is incomplete" : error.message,
      "Download and extract the complete release archive again.",
    );
  }

  const loginPath = discoverLoginPath();
  const commandSearchPath = mergeSearchPaths(process.env.PATH, loginPath);
  const requestedSpineCodex = options.spineCodex
    ? resolveExecutableOption(options.spineCodex)
    : await findSpineCodex(commandSearchPath);
  let spineCodex = null;
  let versionOutput = null;
  let versionIdentity = null;
  let appsProtocol = { mode: "not-probed", reason: null };
  if (!requestedSpineCodex) {
    add(
      "error",
      "SpineCodex",
      "not found automatically",
      `${SPINE_CODEX_INSTALL_COMMAND}\nThen verify: spine-codex --version`,
    );
  } else {
    try {
      await access(
        requestedSpineCodex,
        process.platform === "win32" ? constants.F_OK : constants.X_OK,
      );
      const version = runExecutableSync(requestedSpineCodex, ["--version"], {
        encoding: "utf8",
        env: { ...process.env, PATH: commandSearchPath },
      });
      versionOutput = [version.stdout, version.stderr]
        .filter(Boolean)
        .join("\n")
        .trim();
      if (version.status !== 0) {
        add(
          "error",
          "SpineCodex",
          `${requestedSpineCodex} exited with status ${version.status}`,
          SPINE_CODEX_INSTALL_COMMAND,
        );
      } else {
        const compatibilityVersion = parseCliVersion(versionOutput);
        if (!compatibilityVersion) {
          add(
            "error",
            "SpineCodex",
            `could not parse version output: ${versionOutput || "(empty)"}`,
            SPINE_CODEX_INSTALL_COMMAND,
          );
        } else {
          versionIdentity = await inspectSpineCodexIdentity(
            requestedSpineCodex,
            compatibilityVersion,
          );
          const candidateVersion = versionIdentity.productVersion;
          const accepted = candidateVersion
            ? compareVersions(candidateVersion, MIN_SPINE_CODEX_VERSION) >= 0
            : compareVersions(
                compatibilityVersion,
                VALIDATED_CODEX_COMPATIBILITY_VERSION,
              ) >= 0;
          if (!accepted) {
            const observed = candidateVersion ?? compatibilityVersion;
            const required = candidateVersion
              ? MIN_SPINE_CODEX_VERSION
              : VALIDATED_CODEX_COMPATIBILITY_VERSION;
            add(
              "error",
              "SpineCodex",
              `${observed} is older than required ${required}`,
              SPINE_CODEX_INSTALL_COMMAND,
            );
          } else {
            spineCodex = requestedSpineCodex;
            const product = versionIdentity.productVersion ?? "unknown product";
            const detail =
              versionIdentity.mode === "legacy"
                ? `${product} legacy identity · ${requestedSpineCodex}`
                : `${product} product · Codex ${compatibilityVersion} compatibility · ${requestedSpineCodex}`;
            add("ok", "SpineCodex", detail);
            if (
              versionIdentity.productVersion &&
              compareVersions(
                versionIdentity.productVersion,
                RECOMMENDED_SPINE_CODEX_VERSION,
              ) < 0
            ) {
              add(
                "info",
                "SpineCodex recommendation",
                `${RECOMMENDED_SPINE_CODEX_VERSION} is the validated release baseline`,
                SPINE_CODEX_INSTALL_COMMAND,
              );
            }
          }
        }
      }
    } catch (error) {
      add(
        "error",
        "SpineCodex",
        `${requestedSpineCodex} is not executable`,
        `${SPINE_CODEX_INSTALL_COMMAND}\nOr pass --spine-codex /absolute/path/to/spine-codex`,
      );
    }
  }

  if (spineCodex && options.diagnose) {
    appsProtocol = await probeAppsProtocol(spineCodex, {
      searchPath: commandSearchPath,
    });
    if (appsProtocol.mode === "native") {
      add("ok", "Apps protocol", "native app/installed + app/read");
    } else if (appsProtocol.mode === "legacy-fallback") {
      add("info", "Apps protocol", "legacy app/list adapter required");
    } else {
      add(
        "error",
        "Apps protocol",
        appsProtocol.reason ?? "app-server is unavailable",
        SPINE_CODEX_INSTALL_COMMAND,
      );
    }
  }

  const appPath = options.app ? resolve(options.app) : await findApp();
  let nodeOptionsFuse = null;
  let nodeCliInspectFuse = null;
  let desktopVersion = null;
  let bundleContract = null;
  let inspectableClone = null;
  let desktopValidated = false;
  if (!appPath) {
    add(
      "error",
      "Codex Desktop",
      "Codex Desktop was not found",
      `Download the current ChatGPT desktop app: ${CODEX_DOWNLOAD_URL}`,
    );
  } else {
    try {
      if (process.platform === "darwin") {
        await access(join(appPath, "Contents", "Info.plist"), constants.R_OK);
        await access(join(appPath, "Contents", "Frameworks"), constants.R_OK);
      } else {
        await access(appPath, constants.R_OK);
        if (extname(appPath).toLowerCase() !== ".exe") {
          throw new Error("the Windows App path must point to an .exe file");
        }
      }
      nodeOptionsFuse = await readElectronFuse(
        appPath,
        NODE_OPTIONS_FUSE_INDEX,
      );
      nodeCliInspectFuse = await readElectronFuse(
        appPath,
        NODE_CLI_INSPECT_FUSE_INDEX,
      );
      desktopVersion = readDesktopVersion(appPath);
      if (process.platform === "darwin" && options.mode === "adapter") {
        add("ok", "Codex Desktop", appPath);
        if (!desktopVersion) add("error", "External adapter", "Desktop version could not be read");
        if (compareVersions(desktopVersion, "26.901.20858") < 0)
          add(
            "error",
            "External adapter",
            "Desktop is older than the external adapter baseline 26.901.20858",
          );
        if (
          versionIdentity &&
          compareVersions(versionIdentity.compatibilityVersion, "0.147.0") < 0
        )
          add(
            "error",
            "External adapter",
            "Use SpineCodex 0.3.3 / Codex CLI 0.147.0 or newer for adapter mode",
          );
        if (basename(process.env.SHELL || "/bin/zsh") !== "zsh")
          add(
            "error",
            "External adapter",
            "External adapter currently requires zsh; choose clone mode for other shells",
          );
        add(
          "info",
          "CLI compatibility",
          "External adapter; no main-process hook or Desktop copy required",
        );
      } else if (process.platform === "win32" && nodeCliInspectFuse === "on") {
        add("ok", "Codex Desktop", appPath);
        add(
          "ok",
          "SSH compatibility hook",
          "Electron main-process Inspector injection is enabled",
        );
      } else if (
        process.platform === "win32" &&
        !["off", "removed"].includes(nodeCliInspectFuse)
      ) {
        // Microsoft Store packages can expose a launcher executable while the
        // Electron runtime lives behind the package activation boundary. The
        // fuse sentinel is therefore not a reliable preflight requirement on
        // Windows. The post-launch status-file handshake below is authoritative:
        // the wrapper never injects the renderer unless the main hook reports
        // that both structural patches were installed.
        add("ok", "Codex Desktop", appPath);
        add(
          "info",
          "SSH compatibility hook",
          `Inspector fuse marker ${nodeCliInspectFuse}; runtime injection required`,
        );
      } else if (process.platform === "darwin" && nodeOptionsFuse === "on") {
        add("ok", "Codex Desktop", appPath);
        add(
          "ok",
          "SSH compatibility hook",
          "Electron NODE_OPTIONS fuse is enabled",
        );
      } else if (
        process.platform === "darwin" &&
        ["off", "removed"].includes(nodeCliInspectFuse)
      ) {
        add("ok", "Codex Desktop", appPath);
        if (isCloneDisabled(process.env)) {
          add(
            "error",
            "SSH compatibility hook",
            `Electron main-process Inspector fuse is ${nodeCliInspectFuse}; ` +
              "this Desktop build blocks --inspect* and SIGUSR1, and " +
              `${CLONE_DISABLE_ENV} disables the inspectable clone`,
            `Unset ${CLONE_DISABLE_ENV}, or install a supported current build from ${CODEX_DOWNLOAD_URL}`,
          );
        } else {
          const cloneRoot = resolveCloneRoot(process.env);
          inspectableClone = {
            required: true,
            root: cloneRoot,
            path: join(cloneRoot, basename(appPath)),
            fuse: "nodeCliInspect",
            signing: "ad-hoc",
          };
          add(
            "info",
            "SSH compatibility hook",
            `Electron main-process Inspector fuse is ${nodeCliInspectFuse}; ` +
              "this Desktop build blocks --inspect* and SIGUSR1, so a private " +
              `inspectable clone (${inspectableClone.path}) is launched with ` +
              "that fuse re-enabled and an ad-hoc signature; the original " +
              "bundle stays unmodified",
          );
        }
      } else if (process.platform === "darwin") {
        add("ok", "Codex Desktop", appPath);
        add(
          "info",
          "SSH compatibility hook",
          `Electron NODE_OPTIONS fuse is ${nodeOptionsFuse}; loopback Inspector injection required`,
        );
      } else {
        const fuseName =
          process.platform === "win32"
            ? "main-process Inspector"
            : "NODE_OPTIONS";
        const fuseValue =
          process.platform === "win32" ? nodeCliInspectFuse : nodeOptionsFuse;
        add(
          "error",
          "Codex Desktop",
          `${appPath} has incompatible Electron ${fuseName} fuse: ${fuseValue}`,
          `Install a supported current build from ${CODEX_DOWNLOAD_URL}`,
        );
      }
      desktopValidated = checks.at(-1)?.status !== "error";
    } catch (error) {
      add(
        "error",
        "Codex Desktop",
        `${appPath} is not a valid Codex Desktop installation`,
        `Pass --app with the Codex executable or app bundle, or download it from ${CODEX_DOWNLOAD_URL}`,
      );
    }
  }

  if (
    desktopValidated &&
    process.platform === "darwin" &&
    options.mode !== "adapter"
  ) {
    try {
      bundleContract = await inspectDesktopBundleContract(appPath, {
        minimum: MIN_SPINE_CODEX_VERSION,
      });
      add(
        "ok",
        "Desktop bundle contract",
        `${bundleContract.mainBundle} + ${bundleContract.versionBundle} ` +
          "(version + CLI selector)",
      );
    } catch (error) {
      bundleContract = { status: "incompatible", reason: error.message };
      add(
        "error",
        "Desktop bundle contract",
        error.message,
        `Install a supported current build from ${CODEX_DOWNLOAD_URL}`,
      );
    }
  } else if (desktopValidated && options.mode === "adapter") {
    bundleContract = {
      status: "external-adapter",
      reason: "Verified through CLI initialization at launch",
    };
  } else if (desktopValidated) {
    bundleContract = { status: "runtime-required", reason: null };
    add(
      "info",
      "Desktop bundle contract",
      "runtime main-process handshake required on Windows",
    );
  }

  add(
    "info",
    "Remote requirement",
    `${REMOTE_CLI_NAME} >= ${MIN_SPINE_CODEX_VERSION} on each SSH host`,
  );
  add("info", "Image generation", "disabled for SpineCodex compatibility");
  const ok = checks.every((check) => check.status !== "error");
  return {
    ok,
    startupMode: options.mode ?? "clone",
    checks,
    spineCodex,
    appPath,
    nodeOptionsFuse,
    nodeCliInspectFuse,
    desktopVersion,
    bundleContract,
    inspectableClone,
    versionOutput,
    versionIdentity,
    appsProtocol,
    rendererSource,
    rendererInfo,
    commandSearchPath,
  };
}

function resolveExecutableOption(value) {
  if (
    isAbsolute(value) ||
    value.includes("/") ||
    value.includes("\\") ||
    value.startsWith(".")
  ) {
    return resolve(value);
  }
  return findExecutable(value);
}

function discoverLoginPath() {
  if (process.platform === "win32") {
    return mergeSearchPaths(
      process.env.PATH,
      process.env.APPDATA ? join(process.env.APPDATA, "npm") : "",
      process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "npm") : "",
      process.env.USERPROFILE
        ? join(process.env.USERPROFILE, ".volta", "bin")
        : "",
      process.env.NVM_SYMLINK,
      process.env.NVM_HOME,
    );
  }
  const loginShell = process.env.SHELL || "/bin/zsh";
  try {
    accessSync(loginShell, constants.X_OK);
    const result = spawnSync(loginShell, ["-lic", "printf '%s' \"$PATH\""], {
      encoding: "utf8",
      timeout: 5_000,
      maxBuffer: 256 * 1024,
    });
    if (result.status === 0 && result.stdout.includes("/"))
      return result.stdout.trim();
  } catch {}
  return "";
}

function mergeSearchPaths(...values) {
  const directories = [];
  for (const value of values) {
    for (const directory of (value ?? "").split(delimiter)) {
      if (directory && !directories.includes(directory))
        directories.push(directory);
    }
  }
  return directories.join(delimiter);
}

async function findSpineCodex(commandSearchPath) {
  const candidates = [];
  const add = (candidate) => {
    if (candidate && !candidates.includes(candidate))
      candidates.push(candidate);
  };
  add(process.env.SPINE_CODEX_BINARY);
  add(findExecutable("spine-codex", commandSearchPath));

  if (process.platform === "win32") {
    for (const directory of [
      process.env.APPDATA ? join(process.env.APPDATA, "npm") : null,
      process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "npm") : null,
      process.env.USERPROFILE
        ? join(process.env.USERPROFILE, ".volta", "bin")
        : null,
      process.env.NVM_SYMLINK,
    ]) {
      if (!directory) continue;
      add(findExecutable("spine-codex", directory));
    }
  }

  if (process.platform !== "win32") {
    for (const candidate of [
      "/opt/homebrew/bin/spine-codex",
      "/usr/local/bin/spine-codex",
      join(homedir(), ".local", "bin", "spine-codex"),
      join(homedir(), ".npm-global", "bin", "spine-codex"),
      join(homedir(), ".volta", "bin", "spine-codex"),
    ])
      add(candidate);
  }

  if (process.platform !== "win32") {
    const nvmVersions = join(homedir(), ".nvm", "versions", "node");
    try {
      const versions = await readdir(nvmVersions);
      versions.sort((left, right) =>
        right.localeCompare(left, undefined, { numeric: true }),
      );
      for (const version of versions) {
        add(join(nvmVersions, version, "bin", "spine-codex"));
      }
    } catch {}
  }

  for (const candidate of candidates) {
    try {
      await access(
        candidate,
        process.platform === "win32" ? constants.F_OK : constants.X_OK,
      );
      return candidate;
    } catch {}
  }
  return null;
}

function parseSystemVersion(output) {
  const match = String(output ?? "").match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return [match[1], match[2] ?? "0", match[3] ?? "0"].join(".");
}

function printDiagnosis(diagnosis, { stream = process.stdout } = {}) {
  stream.write(
    `Spine App preflight: ${diagnosis.ok ? "ready" : "action required"}\n`,
  );
  for (const check of diagnosis.checks) {
    const marker =
      check.status === "ok" ? "✓" : check.status === "error" ? "✗" : "•";
    stream.write(`${marker} ${check.label}: ${check.detail}\n`);
    if (check.remedy) {
      for (const line of check.remedy.split("\n"))
        stream.write(`  → ${line}\n`);
    }
  }
}

function printDiagnosisJson(diagnosis, { stream = process.stdout } = {}) {
  const payload = {
    schemaVersion: 1,
    startupMode: diagnosis.startupMode,
    ok: diagnosis.ok,
    app: { version: APP_VERSION },
    spineCodex: {
      path: diagnosis.spineCodex,
      minimumVersion: MIN_SPINE_CODEX_VERSION,
      recommendedVersion: RECOMMENDED_SPINE_CODEX_VERSION,
      validatedCompatibilityVersion: VALIDATED_CODEX_COMPATIBILITY_VERSION,
      mode: diagnosis.versionIdentity?.mode ?? "unavailable",
      productVersion: diagnosis.versionIdentity?.productVersion ?? null,
      productVersionSource:
        diagnosis.versionIdentity?.productVersionSource ?? "unavailable",
      productPackagePath: diagnosis.versionIdentity?.productPackagePath ?? null,
      compatibilityVersion:
        diagnosis.versionIdentity?.compatibilityVersion ?? null,
      appsProtocol: diagnosis.appsProtocol,
    },
    codexDesktop: {
      path: diagnosis.appPath,
      version: diagnosis.desktopVersion,
      validatedVersions: VALIDATED_DESKTOP_VERSIONS,
      validatedBuild:
        diagnosis.desktopVersion == null
          ? null
          : VALIDATED_DESKTOP_VERSIONS.includes(diagnosis.desktopVersion),
      nodeOptionsFuse: diagnosis.nodeOptionsFuse,
      nodeCliInspectFuse: diagnosis.nodeCliInspectFuse,
      bundleContract: diagnosis.bundleContract,
      inspectableClone: diagnosis.inspectableClone,
    },
    renderer: diagnosis.rendererInfo,
    remote: { minimumSpineCodexVersion: MIN_SPINE_CODEX_VERSION },
    imageGeneration: { mode: "disabled-compatibility-workaround" },
    checks: diagnosis.checks,
  };
  stream.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function readDesktopVersion(applicationPath) {
  if (process.platform === "darwin") {
    const result = spawnSync(
      "/usr/bin/plutil",
      [
        "-extract",
        "CFBundleShortVersionString",
        "raw",
        join(applicationPath, "Contents", "Info.plist"),
      ],
      { encoding: "utf8", timeout: 5_000 },
    );
    return result.status === 0 ? result.stdout.trim() || null : null;
  }
  if (process.platform === "win32") {
    const script =
      "(Get-Item -LiteralPath $args[0]).VersionInfo.ProductVersion";
    const result = spawnSync(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        script,
        applicationPath,
      ],
      { encoding: "utf8", timeout: 5_000, windowsHide: true },
    );
    return result.status === 0 ? result.stdout.trim() || null : null;
  }
  return null;
}

async function findApp() {
  if (process.platform === "win32") return findWindowsApp();
  const candidates = [
    "/Applications/ChatGPT.app",
    "/Applications/Codex.app",
    join(homedir(), "Applications", "ChatGPT.app"),
    join(homedir(), "Applications", "Codex.app"),
  ];
  const spotlight = spawnSync(
    "/usr/bin/mdfind",
    ["kMDItemCFBundleIdentifier == 'com.openai.codex'"],
    { encoding: "utf8", timeout: 5_000, maxBuffer: 512 * 1024 },
  );
  if (spotlight.status === 0) {
    for (const candidate of spotlight.stdout.split(/\r?\n/)) {
      if (candidate.trim()) candidates.push(candidate.trim());
    }
  }
  const cloneRoot = resolveCloneRoot(process.env);
  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    // The private inspectable clone shares the Desktop bundle identifier, so
    // Spotlight may list it; only the official installation is a launch source.
    if (candidate === cloneRoot || candidate.startsWith(`${cloneRoot}/`))
      continue;
    try {
      await access(candidate, constants.R_OK);
      return candidate;
    } catch {}
  }
  return null;
}

async function findWindowsApp() {
  const candidates = [];
  const add = (candidate) => {
    if (candidate && !candidates.includes(candidate))
      candidates.push(candidate);
  };
  add(process.env.CODEX_APP_PATH);
  if (process.env.LOCALAPPDATA) {
    add(join(process.env.LOCALAPPDATA, "Programs", "ChatGPT", "ChatGPT.exe"));
    add(join(process.env.LOCALAPPDATA, "Programs", "OpenAI", "ChatGPT.exe"));
    add(join(process.env.LOCALAPPDATA, "Programs", "Codex", "Codex.exe"));
  }
  if (process.env.ProgramFiles) {
    add(join(process.env.ProgramFiles, "ChatGPT", "ChatGPT.exe"));
    add(join(process.env.ProgramFiles, "Codex", "Codex.exe"));
  }

  const appxScript = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$knownPackageNames = @(
  'OpenAI.ChatGPT-Desktop',
  'OpenAI.ChatGPT',
  'OpenAI.Codex'
)
$knownPackageFamilies = @(
  'OpenAI.ChatGPT-Desktop_2p2nqsd0c76g0'
)

$packages = @()
foreach ($name in $knownPackageNames) {
  $packages += @(Get-AppxPackage -Name $name)
}
$packages += @(Get-AppxPackage | Where-Object {
  $name = [string]$_.Name
  $family = [string]$_.PackageFamilyName
  ($knownPackageFamilies -contains $family) -or
  $name -like 'OpenAI.ChatGPT*' -or
  $name -like 'OpenAI.Codex*'
})

$seenPackages = @{}
$results = @()
foreach ($package in @($packages | Sort-Object Version -Descending)) {
  $family = [string]$package.PackageFamilyName
  if ([string]::IsNullOrWhiteSpace($family) -or $seenPackages.ContainsKey($family)) {
    continue
  }
  $seenPackages[$family] = $true
  $manifest = Get-AppxPackageManifest -Package ([string]$package.PackageFullName)
  foreach ($application in @($manifest.Package.Applications.Application)) {
    $relative = [Environment]::ExpandEnvironmentVariables(
      ([string]$application.Executable).Trim('"')
    )
    if ([string]::IsNullOrWhiteSpace($relative)) { continue }
    $executable = if ([IO.Path]::IsPathRooted($relative)) {
      $relative
    } else {
      Join-Path ([string]$package.InstallLocation) $relative
    }
    if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) { continue }
    $filename = [IO.Path]::GetFileName($executable)
    $rank = if ($filename -ieq 'ChatGPT.exe' -or $filename -ieq 'Codex.exe') { 0 } else { 1 }
    $results += [PSCustomObject]@{
      Path = $executable
      Rank = $rank
      Version = [Version]$package.Version
    }
  }
}

$ordered = @($results | Sort-Object Rank, @{ Expression = 'Version'; Descending = $true })
foreach ($result in $ordered) {
  [Console]::Out.WriteLine([string]$result.Path)
}
if ($ordered.Count -eq 0) { exit 1 }
`;
  const discovered = spawnSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", appxScript],
    { encoding: "utf8", timeout: 10_000, windowsHide: true },
  );
  if (discovered.status === 0) {
    for (const candidate of discovered.stdout.split(/\r?\n/)) {
      add(candidate.trim());
    }
  }

  const startAppScript = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
foreach ($entry in @(Get-StartApps)) {
  $appId = [string]$entry.AppID
  if (Test-Path -LiteralPath $appId -PathType Leaf) {
    $name = [IO.Path]::GetFileName($appId)
    if ($name -ieq 'ChatGPT.exe' -or $name -ieq 'Codex.exe') {
      [Console]::Out.WriteLine($appId)
    }
  }
}
`;
  const startApps = spawnSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", startAppScript],
    { encoding: "utf8", timeout: 10_000, windowsHide: true },
  );
  if (startApps.status === 0) {
    for (const candidate of startApps.stdout.split(/\r?\n/)) {
      add(candidate.trim());
    }
  }

  let firstReadable = null;
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.R_OK);
      firstReadable ??= candidate;
      if (
        (await readElectronFuseFromBinary(
          candidate,
          NODE_CLI_INSPECT_FUSE_INDEX,
        )) === "on"
      ) {
        return candidate;
      }
    } catch {}
  }
  return firstReadable;
}

async function readElectronFuse(applicationPath, fuseIndex) {
  if (process.platform === "win32") {
    return readElectronFuseFromBinary(applicationPath, fuseIndex);
  }
  const frameworksPath = join(applicationPath, "Contents", "Frameworks");
  const entries = await readdir(frameworksPath, { withFileTypes: true });
  const frameworkBundle = entries.find(
    (entry) => entry.isDirectory() && / Framework\.framework$/.test(entry.name),
  )?.name;
  if (!frameworkBundle) return "not-found";
  const frameworkName = frameworkBundle.slice(0, -".framework".length);
  const framework = join(frameworksPath, frameworkBundle, frameworkName);
  return readElectronFuseFromBinary(framework, fuseIndex);
}

async function readElectronFuseFromBinary(binaryPath, fuseIndex) {
  return readFuseState(binaryPath, fuseIndex);
}

function isAppRunning(applicationPath) {
  if (process.platform === "win32") {
    const script = String.raw`
$target = [IO.Path]::GetFullPath($args[0])
$running = Get-Process -ErrorAction SilentlyContinue | Where-Object {
  try { [IO.Path]::GetFullPath($_.Path) -ieq $target } catch { $false }
} | Select-Object -First 1
if ($null -eq $running) { exit 1 } else { exit 0 }
`;
    const check = spawnSync(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        script,
        applicationPath,
      ],
      { encoding: "utf8", timeout: 5_000, windowsHide: true },
    );
    return check.status === 0;
  }
  const check = spawnSync(
    "/usr/bin/osascript",
    ["-e", 'application id "com.openai.codex" is running'],
    { encoding: "utf8" },
  );
  return check.status === 0 && check.stdout.trim() === "true";
}

async function launchCodexApp({
  appPath,
  deepLink,
  debugPort,
  mainInspectorPort,
  appEnvironment,
}) {
  const electronArguments = [
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${debugPort}`,
    ...(args.userDataDir ? [`--user-data-dir=${args.userDataDir}`] : []),
  ];
  if (process.platform === "darwin") {
    {
      const executable = resolveMacOsExecutable(appPath);
      // The launched bundle is either a Desktop build whose Node CLI inspect
      // fuse is enabled or the private inspectable clone prepared above, so
      // `--inspect-brk` pauses the main process before its first script and
      // the hook is loaded through the loopback Inspector before it resumes.
      const child = spawn(
        executable,
        [
          ...electronArguments,
          ...(mainInspectorPort != null
            ? [`--inspect-brk=127.0.0.1:${mainInspectorPort}`]
            : []),
          ...(deepLink ? [deepLink] : []),
        ],
        {
          cwd: dirname(executable),
          detached: true,
          env: appEnvironment,
          stdio: "ignore",
        },
      );
      await new Promise((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", reject);
      });
      child.unref();
      return child;
    }
  }

  if (mainInspectorPort != null) {
    electronArguments.unshift(`--inspect-brk=127.0.0.1:${mainInspectorPort}`);
  }
  const appArguments = deepLink
    ? [...electronArguments, deepLink]
    : electronArguments;
  const child = spawn(appPath, appArguments, {
    cwd: dirname(appPath),
    detached: true,
    env: appEnvironment,
    stdio: "ignore",
    windowsHide: false,
  });
  await new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  child.unref();
  return child;
}

function resolveMacOsExecutable(appPath) {
  const bundleName = basename(appPath, ".app");
  const candidate = join(appPath, "Contents", "MacOS", bundleName);
  try {
    accessSync(candidate, constants.X_OK);
    return candidate;
  } catch {}
  return join(appPath, "Contents", "MacOS", "ChatGPT");
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

async function waitForTarget(port) {
  const deadline = Date.now() + 20_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
        signal: AbortSignal.timeout(800),
      });
      if (!response.ok) throw new Error(`CDP returned HTTP ${response.status}`);
      const targets = await response.json();
      const candidates = targets.filter(isMainRendererTarget);
      if (candidates.length > 1)
        throw new Error("ambiguous main Renderer targets");
      const target = candidates[0];
      if (target) return target;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(
    `timed out waiting for Codex renderer: ${lastError?.message ?? "no target"}`,
  );
}

async function inject(webSocketUrl, port, source) {
  const url = new URL(webSocketUrl);
  if (
    url.protocol !== "ws:" ||
    !["127.0.0.1", "::1"].includes(url.hostname) ||
    Number(url.port) !== port
  ) {
    throw new Error("refusing unsafe CDP WebSocket URL");
  }
  const socket = new WebSocket(url);
  await Promise.race([
    new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener(
        "error",
        () => reject(new Error("CDP connection failed")),
        { once: true },
      );
    }),
    timeout(4_000, "CDP connection timed out"),
  ]);
  let nextId = 0;
  const command = (method, params) => {
    const id = ++nextId;
    socket.send(JSON.stringify({ id, method, params }));
    return Promise.race([
      new Promise((resolve, reject) => {
        const listener = (event) => {
          const message = JSON.parse(event.data);
          if (message.id !== id) return;
          socket.removeEventListener("message", listener);
          if (message.error)
            reject(new Error(`${method}: ${JSON.stringify(message.error)}`));
          else resolve(message.result);
        };
        socket.addEventListener("message", listener);
      }),
      timeout(4_000, `${method} timed out`),
    ]);
  };
  await command("Page.enable", {});
  await command("Page.addScriptToEvaluateOnNewDocument", { source });
  const result = await command("Runtime.evaluate", {
    expression: source,
    returnByValue: true,
  });
  socket.close();
  if (result?.exceptionDetails)
    throw new Error("renderer injection raised an exception");
}

function timeout(milliseconds, message) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(message)), milliseconds),
  );
}

function fail(message) {
  console.error(`spine-app: ${message}`);
  process.exit(1);
}
