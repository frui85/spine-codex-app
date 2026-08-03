#!/usr/bin/env node
import { access, open as openFile, readFile, readdir } from "node:fs/promises";
import { accessSync, constants } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const APP_VERSION = "0.2.2";
const LOCAL_CLI_DIR = join(HERE, "bin");
const LOCAL_CLI_SHIM = join(LOCAL_CLI_DIR, "spine-codex");
const ELECTRON_MAIN_HOOK = join(HERE, "spine-electron-main-hook.cjs");
const REMOTE_CLI_NAME = "spine-codex";
const MIN_SPINE_CODEX_VERSION = "0.2.2";
const MIN_NODE_VERSION = "22.0.0";
const MIN_MACOS_VERSION = "14.0.0";
const CODEX_DOWNLOAD_URL = "https://chatgpt.com/download/";
const SPINE_CODEX_INSTALL_COMMAND = "npm install -g @spinejit/spine-codex@latest";
const ELECTRON_FUSE_SENTINEL = Buffer.from(
  "dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX",
  "ascii",
);
const NODE_OPTIONS_FUSE_INDEX = 2;
const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`Usage: spine-app [OPTIONS] [PATH]

Launch Codex Desktop with the installed SpineCodex backend and a lightweight
Spine Tree section embedded in Codex's native summary panel. Connected SSH
hosts use their own spine-codex command instead of codex.

Options:
  --spine-codex PATH  SpineCodex binary (default: resolve from PATH)
  --app PATH          Codex/ChatGPT app bundle (default: auto-detect)
  --diagnose          Check every prerequisite without launching the app
  -V, --version       Print the wrapper version
  -h, --help          Show this help`);
  process.exit(0);
}

if (args.version) {
  console.log(`spine-app ${APP_VERSION}`);
  process.exit(0);
}

const diagnosis = await diagnose(args);

if (args.diagnose) {
  printDiagnosis(diagnosis);
  process.exit(diagnosis.ok ? 0 : 1);
}

if (!diagnosis.ok) {
  printDiagnosis(diagnosis, { stream: process.stderr });
  console.error("\nFix the missing requirements above, then run: spine-app --diagnose");
  process.exit(1);
}

const {
  spineCodex,
  appPath,
  nodeOptionsFuse,
  versionOutput,
  commandSearchPath,
  rendererSource: SCRIPT,
} = diagnosis;

if (isAppRunning()) {
  fail("Codex Desktop is running. Quit it completely, then run spine-app again.");
}

const debugPort = await reservePort();
const deepLink = args.workspace == null
  ? null
  : `codex://threads/new?path=${encodeURIComponent(resolve(process.cwd(), args.workspace))}`;
const appSearchPath = [LOCAL_CLI_DIR, commandSearchPath]
  .filter(Boolean)
  .join(delimiter);
const mainHookOption = `--require ${JSON.stringify(ELECTRON_MAIN_HOOK)}`;
const nodeOptions = [mainHookOption, process.env.NODE_OPTIONS].filter(Boolean).join(" ");
const openArguments = [
    "-n",
    "--env",
    `PATH=${appSearchPath}`,
    "--env",
    `CODEX_CLI_PATH=${LOCAL_CLI_SHIM}`,
    "--env",
    `SPINE_CODEX_REMOTE_CLI=${REMOTE_CLI_NAME}`,
    "--env",
    `SPINE_CODEX_BINARY=${spineCodex}`,
    "--env",
    `SPINE_CODEX_MIN_VERSION=${MIN_SPINE_CODEX_VERSION}`,
    "--env",
    `NODE_OPTIONS=${nodeOptions}`,
    "-a",
    appPath,
  ];
if (deepLink) openArguments.push(deepLink);
openArguments.push(
    "--args",
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${debugPort}`,
  );
const child = spawn(
  "/usr/bin/open",
  openArguments,
  { stdio: "inherit" },
);
const status = await new Promise((resolve) => child.once("exit", resolve));
if (status !== 0) fail(`open exited with status ${status}`);

process.stdout.write("Waiting for Codex renderer… ");
const target = await waitForTarget(debugPort);
await inject(target.webSocketDebuggerUrl, debugPort, SCRIPT);
console.log("Spine Tree ready.");

function parseArgs(values) {
  const parsed = {
    workspace: null,
    spineCodex: null,
    app: null,
    diagnose: false,
    version: false,
    help: false,
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "-h" || value === "--help") parsed.help = true;
    else if (value === "-V" || value === "--version") parsed.version = true;
    else if (value === "--diagnose") parsed.diagnose = true;
    else if (value === "--spine-codex") parsed.spineCodex = requiredValue(values, ++index, value);
    else if (value === "--app") parsed.app = requiredValue(values, ++index, value);
    else if (value.startsWith("-")) fail(`unknown option: ${value}`);
    else parsed.workspace = value;
  }
  return parsed;
}

function requiredValue(values, index, option) {
  if (!values[index]) fail(`${option} requires a value`);
  return values[index];
}

function findExecutable(name, searchPath = process.env.PATH ?? "") {
  for (const directory of searchPath.split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  return null;
}

function parseCliVersion(output) {
  return String(output).match(/(?:^|\s)v?(\d+\.\d+\.\d+)(?=\s|$)/)?.[1] ?? null;
}

function compareVersions(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
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
  } else {
    add(
      "error",
      "Platform",
      `${process.platform} is unsupported`,
      "This release currently supports macOS only.",
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
  try {
    rendererSource = await readFile(join(HERE, "spine-view.js"), "utf8");
    await access(LOCAL_CLI_SHIM, constants.X_OK);
    await access(ELECTRON_MAIN_HOOK, constants.R_OK);
    add("ok", "Wrapper files", `${Buffer.byteLength(rendererSource)} byte renderer`);
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
  if (!requestedSpineCodex) {
    add(
      "error",
      "SpineCodex",
      "not found automatically",
      `${SPINE_CODEX_INSTALL_COMMAND}\nThen verify: spine-codex --version`,
    );
  } else {
    try {
      await access(requestedSpineCodex, constants.X_OK);
      const version = spawnSync(requestedSpineCodex, ["--version"], {
        encoding: "utf8",
        env: { ...process.env, PATH: commandSearchPath },
      });
      versionOutput = [version.stdout, version.stderr].filter(Boolean).join("\n").trim();
      if (version.status !== 0) {
        add(
          "error",
          "SpineCodex",
          `${requestedSpineCodex} exited with status ${version.status}`,
          SPINE_CODEX_INSTALL_COMMAND,
        );
      } else {
        const parsed = parseCliVersion(versionOutput);
        if (!parsed) {
          add(
            "error",
            "SpineCodex",
            `could not parse version output: ${versionOutput || "(empty)"}`,
            SPINE_CODEX_INSTALL_COMMAND,
          );
        } else if (compareVersions(parsed, MIN_SPINE_CODEX_VERSION) < 0) {
          add(
            "error",
            "SpineCodex",
            `${parsed} is older than required ${MIN_SPINE_CODEX_VERSION}`,
            SPINE_CODEX_INSTALL_COMMAND,
          );
        } else {
          spineCodex = requestedSpineCodex;
          add("ok", "SpineCodex", `${parsed} · ${requestedSpineCodex}`);
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

  const appPath = options.app ? resolve(options.app) : await findApp();
  let nodeOptionsFuse = null;
  if (!appPath) {
    add(
      "error",
      "Codex Desktop",
      "ChatGPT.app or Codex.app was not found",
      `Download the current ChatGPT desktop app: ${CODEX_DOWNLOAD_URL}`,
    );
  } else {
    try {
      await access(join(appPath, "Contents", "Info.plist"), constants.R_OK);
      await access(join(appPath, "Contents", "Frameworks"), constants.R_OK);
      nodeOptionsFuse = await readNodeOptionsFuse(appPath);
      if (nodeOptionsFuse !== "on") {
        add(
          "error",
          "Codex Desktop",
          `${appPath} has incompatible Electron NODE_OPTIONS fuse: ${nodeOptionsFuse}`,
          `Install a supported current build from ${CODEX_DOWNLOAD_URL}`,
        );
      } else {
        add("ok", "Codex Desktop", appPath);
        add("ok", "SSH compatibility hook", "Electron NODE_OPTIONS fuse is enabled");
      }
    } catch (error) {
      add(
        "error",
        "Codex Desktop",
        `${appPath} is not a valid app bundle`,
        `Pass --app /absolute/path/to/ChatGPT.app or download it from ${CODEX_DOWNLOAD_URL}`,
      );
    }
  }

  add("info", "Remote requirement", `${REMOTE_CLI_NAME} >= ${MIN_SPINE_CODEX_VERSION} on each SSH host`);
  add("info", "Image generation", "disabled for SpineCodex compatibility");
  const ok = checks.every((check) => check.status !== "error");
  return {
    ok,
    checks,
    spineCodex,
    appPath,
    nodeOptionsFuse,
    versionOutput,
    rendererSource,
    commandSearchPath,
  };
}

function resolveExecutableOption(value) {
  if (value.includes("/") || value.startsWith(".")) return resolve(value);
  return findExecutable(value);
}

function discoverLoginPath() {
  const loginShell = process.env.SHELL || "/bin/zsh";
  try {
    accessSync(loginShell, constants.X_OK);
    const result = spawnSync(loginShell, ["-lic", "printf '%s' \"$PATH\""], {
      encoding: "utf8",
      timeout: 5_000,
      maxBuffer: 256 * 1024,
    });
    if (result.status === 0 && result.stdout.includes("/")) return result.stdout.trim();
  } catch {}
  return "";
}

function mergeSearchPaths(...values) {
  const directories = [];
  for (const value of values) {
    for (const directory of (value ?? "").split(delimiter)) {
      if (directory && !directories.includes(directory)) directories.push(directory);
    }
  }
  return directories.join(delimiter);
}

async function findSpineCodex(commandSearchPath) {
  const candidates = [];
  const add = (candidate) => {
    if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
  };
  add(process.env.SPINE_CODEX_BINARY);
  add(findExecutable("spine-codex", commandSearchPath));

  for (const candidate of [
    "/opt/homebrew/bin/spine-codex",
    "/usr/local/bin/spine-codex",
    join(homedir(), ".local", "bin", "spine-codex"),
    join(homedir(), ".npm-global", "bin", "spine-codex"),
    join(homedir(), ".volta", "bin", "spine-codex"),
  ]) add(candidate);

  const nvmVersions = join(homedir(), ".nvm", "versions", "node");
  try {
    const versions = await readdir(nvmVersions);
    versions.sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
    for (const version of versions) {
      add(join(nvmVersions, version, "bin", "spine-codex"));
    }
  } catch {}

  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
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
  stream.write(`Spine App preflight: ${diagnosis.ok ? "ready" : "action required"}\n`);
  for (const check of diagnosis.checks) {
    const marker = check.status === "ok" ? "✓" : check.status === "error" ? "✗" : "•";
    stream.write(`${marker} ${check.label}: ${check.detail}\n`);
    if (check.remedy) {
      for (const line of check.remedy.split("\n")) stream.write(`  → ${line}\n`);
    }
  }
}

async function findApp() {
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
  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      await access(candidate, constants.R_OK);
      return candidate;
    } catch {}
  }
  return null;
}

async function readNodeOptionsFuse(applicationPath) {
  const frameworksPath = join(applicationPath, "Contents", "Frameworks");
  const entries = await readdir(frameworksPath, { withFileTypes: true });
  const frameworkBundle = entries.find(
    (entry) =>
      entry.isDirectory() &&
      / Framework\.framework$/.test(entry.name),
  )?.name;
  if (!frameworkBundle) return "not-found";
  const frameworkName = frameworkBundle.slice(0, -".framework".length);
  const framework = join(
    frameworksPath,
    frameworkBundle,
    frameworkName,
  );
  const handle = await openFile(framework, "r");
  const chunkSize = 1024 * 1024;
  const overlapSize = ELECTRON_FUSE_SENTINEL.length + 2 + 32;
  let overlap = Buffer.alloc(0);
  let position = 0;
  try {
    while (true) {
      const chunk = Buffer.allocUnsafe(chunkSize);
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, position);
      if (bytesRead === 0) break;
      position += bytesRead;
      const window = Buffer.concat([overlap, chunk.subarray(0, bytesRead)]);
      const sentinelIndex = window.indexOf(ELECTRON_FUSE_SENTINEL);
      if (sentinelIndex >= 0) {
        const header = sentinelIndex + ELECTRON_FUSE_SENTINEL.length;
        if (window.length < header + 2) {
          overlap = window.subarray(sentinelIndex);
          continue;
        }
        const schema = window[header];
        const count = window[header + 1];
        if (schema !== 1 || count <= NODE_OPTIONS_FUSE_INDEX) return "unsupported";
        if (window.length < header + 2 + count) {
          overlap = window.subarray(sentinelIndex);
          continue;
        }
        const value = window[header + 2 + NODE_OPTIONS_FUSE_INDEX];
        return value === 0x31 ? "on" :
          value === 0x30 ? "off" :
          value === 0x32 ? "removed" :
          value === 0x33 ? "inherit" : "unknown";
      }
      overlap = window.subarray(Math.max(0, window.length - overlapSize));
    }
  } finally {
    await handle.close();
  }
  return "not-found";
}

function isAppRunning() {
  const check = spawnSync("/usr/bin/osascript", [
    "-e",
    'application id "com.openai.codex" is running',
  ], { encoding: "utf8" });
  return check.status === 0 && check.stdout.trim() === "true";
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
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
      const target = targets.find((item) =>
        item.type === "page" &&
        typeof item.webSocketDebuggerUrl === "string" &&
        (item.url?.startsWith("app://") ||
          item.url?.startsWith("codex://") ||
          /codex|chatgpt/i.test(item.title ?? "")));
      if (target) return target;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`timed out waiting for Codex renderer: ${lastError?.message ?? "no target"}`);
}

async function inject(webSocketUrl, port, source) {
  const url = new URL(webSocketUrl);
  if (url.protocol !== "ws:" || !["127.0.0.1", "::1"].includes(url.hostname) ||
      Number(url.port) !== port) {
    throw new Error("refusing unsafe CDP WebSocket URL");
  }
  const socket = new WebSocket(url);
  await Promise.race([
    new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error("CDP connection failed")), { once: true });
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
          if (message.error) reject(new Error(`${method}: ${JSON.stringify(message.error)}`));
          else resolve(message.result);
        };
        socket.addEventListener("message", listener);
      }),
      timeout(4_000, `${method} timed out`),
    ]);
  };
  await command("Page.enable", {});
  await command("Page.addScriptToEvaluateOnNewDocument", { source });
  const result = await command("Runtime.evaluate", { expression: source, returnByValue: true });
  socket.close();
  if (result?.exceptionDetails) throw new Error("renderer injection raised an exception");
}

function timeout(milliseconds, message) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), milliseconds));
}

function fail(message) {
  console.error(`spine-app: ${message}`);
  process.exit(1);
}
