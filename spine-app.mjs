#!/usr/bin/env node
import {
  access,
  mkdtemp,
  open as openFile,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { accessSync, constants, rmSync } from "node:fs";
import { createServer } from "node:net";
import { createHash } from "node:crypto";
import { homedir, release as osRelease, tmpdir } from "node:os";
import { delimiter, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { injectMainProcessHook } from "./lib/main-inspector.mjs";
import { superviseRenderer } from "./lib/renderer-supervisor.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const APP_VERSION = "26.901.20858";
const SUPPORTED_DESKTOP_VERSION = "26.901.20858";
const LOCAL_CLI_DIR = join(HERE, "bin");
const LOCAL_CLI_SHIM = join(
  LOCAL_CLI_DIR,
  process.platform === "win32" ? "spine-codex.exe" : "spine-codex",
);
const ELECTRON_MAIN_HOOK = join(HERE, "spine-electron-main-hook.cjs");
const REMOTE_CLI_NAME = "spine-codex";
const MIN_SPINE_CODEX_VERSION = "0.2.2";
const MIN_CODEX_APP_SERVER_VERSION = "0.141.0";
const MIN_SPINE_CODEX_RELEASE = "0.3.3";
const MIN_NODE_VERSION = "22.0.0";
const MIN_MACOS_VERSION = "14.0.0";
const MIN_WINDOWS_VERSION = "10.0.17763";
const CODEX_DOWNLOAD_URL = "https://chatgpt.com/download/";
const SPINE_CODEX_INSTALL_COMMAND = "npm install -g @spinejit/spine-codex@latest";
const ELECTRON_FUSE_SENTINEL = Buffer.from(
  "dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX",
  "ascii",
);
const NODE_OPTIONS_FUSE_INDEX = 2;
const NODE_CLI_INSPECT_FUSE_INDEX = 3;
const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`Usage: spine-app [OPTIONS] [PATH]

Launch Codex Desktop with the installed SpineCodex backend and a lightweight
Spine Tree section embedded in Codex's native summary panel. Connected SSH
hosts use their own spine-codex command instead of codex.

Options:
  --spine-codex PATH  SpineCodex binary (default: resolve from PATH)
  --app PATH          Codex executable or macOS app bundle (default: auto-detect)
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
  versionOutput,
  commandSearchPath,
  rendererSource: SCRIPT,
} = diagnosis;

if (isAppRunning(appPath)) {
  fail("Codex Desktop is running. Quit it completely, then run spine-app again.");
}

const debugPort = await reservePort();
const mainInspectorPort = process.platform === "win32" ? await reservePort() : null;
const mainHookStatusPath = join(
  tmpdir(),
  `spine-codex-main-hook-${process.pid}-${debugPort}.json`,
);
const deepLink = args.workspace == null
  ? null
  : `codex://threads/new?path=${encodeURIComponent(resolve(process.cwd(), args.workspace))}`;
const appSearchPath = [LOCAL_CLI_DIR, commandSearchPath]
  .filter(Boolean)
  .join(delimiter);
const shellEnvironment = process.platform === "darwin"
  ? await createMacShellEnvironment(LOCAL_CLI_DIR)
  : {};
const mainHookOption = process.platform === "win32"
  ? `--require "${ELECTRON_MAIN_HOOK.replaceAll('"', '\\"')}"`
  : `--require ${JSON.stringify(ELECTRON_MAIN_HOOK)}`;
const nodeOptions = [mainHookOption, process.env.NODE_OPTIONS].filter(Boolean).join(" ");
const appEnvironment = {
  ...process.env,
  ...shellEnvironment,
  PATH: appSearchPath,
  // Current macOS Electron builds disable main-process preload injection. The
  // supported CODEX_CLI_PATH boundary therefore uses the portable
  // `spine-codex` name. On macOS our temporary ZDOTDIR puts the private adapter
  // first for local launches; an SSH host resolves its own real spine-codex.
  // Windows keeps the previous main-hook selector until it moves to this path.
  CODEX_CLI_PATH: REMOTE_CLI_NAME,
  SPINE_CODEX_LOCAL_CLI_PATH: LOCAL_CLI_SHIM,
  SPINE_CODEX_BINARY: spineCodex,
  SPINE_CODEX_SHIM_NODE: process.execPath,
  SPINE_CODEX_MIN_VERSION: MIN_SPINE_CODEX_VERSION,
  SPINE_CODEX_MAIN_HOOK_STATUS: mainHookStatusPath,
  SPINE_CODEX_RENDERER_PATH: join(HERE, "spine-view.js"),
  SPINE_CODEX_RENDERER_SHA256: createHash("sha256").update(SCRIPT).digest("hex"),
  ...(process.platform === "darwin" ? {} : { NODE_OPTIONS: nodeOptions }),
};
const launchedApp = await launchCodexApp({
  appPath,
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
      hookPath: ELECTRON_MAIN_HOOK,
      timeoutMs: 15_000,
    });
  } catch (error) {
    try { launchedApp?.kill(); } catch {}
    fail(
      "Windows main-process injection failed; Codex was not allowed to " +
        `continue unpatched: ${error.message}`,
    );
  }
  console.log("ready.");
}

if (process.platform === "win32") {
  process.stdout.write("Waiting for Codex main-process hook… ");
  await waitForMainHookReady(mainHookStatusPath, 20_000);
  console.log("ready.");
}

process.stdout.write("Waiting for Codex renderer… ");
await superviseRenderer({
  port: debugPort,
  rendererSource: SCRIPT,
  onReady: () => console.log("Spine Tree ready; monitoring renderer reloads."),
});

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
  const extensions = process.platform === "win32" && extname(name) === ""
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
  try {
    rendererSource = await readFile(join(HERE, "spine-view.js"), "utf8");
    await access(
      LOCAL_CLI_SHIM,
      process.platform === "win32" ? constants.F_OK : constants.X_OK,
    );
    if (process.platform === "win32") {
      await access(ELECTRON_MAIN_HOOK, constants.R_OK);
    }
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
      await access(
        requestedSpineCodex,
        process.platform === "win32" ? constants.F_OK : constants.X_OK,
      );
      const version = runExecutableSync(requestedSpineCodex, ["--version"], {
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
        } else if (compareVersions(
          parsed,
          process.platform === "darwin"
            ? MIN_CODEX_APP_SERVER_VERSION
            : MIN_SPINE_CODEX_VERSION,
        ) < 0) {
          const minimum = process.platform === "darwin"
            ? MIN_CODEX_APP_SERVER_VERSION
            : MIN_SPINE_CODEX_VERSION;
          add(
            "error",
            "SpineCodex",
            `${parsed} is older than required ${minimum}`,
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
  let nodeCliInspectFuse = null;
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
      if (process.platform === "darwin") {
        const desktopVersion = readMacAppVersion(appPath);
        const desktopComparison = compareVersions(
          desktopVersion,
          SUPPORTED_DESKTOP_VERSION,
        );
        if (desktopComparison < 0) {
          add(
            "error",
            "Codex Desktop",
            `${desktopVersion} is unsupported; this release requires ${SUPPORTED_DESKTOP_VERSION}`,
            `Install ChatGPT/Codex Desktop ${SUPPORTED_DESKTOP_VERSION}. Older Desktop versions are not supported by this release.`,
          );
        } else if (desktopComparison > 0) {
          add(
            "info",
            "Codex Desktop",
            `${desktopVersion} · unverified with release ${APP_VERSION}`,
            `Only Desktop ${SUPPORTED_DESKTOP_VERSION} is guaranteed compatible. Install the matching SpineCodex App release when available.`,
          );
        } else {
          add(
            "ok",
            "Codex Desktop",
            `${desktopVersion} · verified exact match · ${appPath}`,
          );
        }
        add(
          "ok",
          "CLI compatibility",
          `external ${REMOTE_CLI_NAME} PATH adapter; no Electron main-process hook required`,
        );
      } else {
        nodeOptionsFuse = await readElectronFuse(appPath, NODE_OPTIONS_FUSE_INDEX);
        nodeCliInspectFuse = await readElectronFuse(
          appPath,
          NODE_CLI_INSPECT_FUSE_INDEX,
        );
      }
      if (process.platform === "win32" && nodeCliInspectFuse === "on") {
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
      } else if (process.platform === "win32") {
        add(
          "error",
          "Codex Desktop",
          `${appPath} has incompatible Electron main-process Inspector fuse: ${nodeCliInspectFuse}`,
          `Install a supported current build from ${CODEX_DOWNLOAD_URL}`,
        );
      }
    } catch (error) {
      add(
        "error",
        "Codex Desktop",
        `${appPath} is not a valid Codex Desktop installation`,
        `Pass --app with the Codex executable or app bundle, or download it from ${CODEX_DOWNLOAD_URL}`,
      );
    }
  }

  add(
    "info",
    "Remote requirement",
    process.platform === "darwin"
      ? `${REMOTE_CLI_NAME} >= ${MIN_SPINE_CODEX_RELEASE} on each SSH host; no remote adapter required`
      : `${REMOTE_CLI_NAME} reporting codex-cli >= ${MIN_SPINE_CODEX_VERSION} on each SSH host`,
  );
  add("info", "Image generation", "disabled for SpineCodex compatibility");
  const ok = checks.every((check) => check.status !== "error");
  return {
    ok,
    checks,
    spineCodex,
    appPath,
    nodeOptionsFuse,
    nodeCliInspectFuse,
    versionOutput,
    rendererSource,
    commandSearchPath,
  };
}

function resolveExecutableOption(value) {
  if (isAbsolute(value) || value.includes("/") || value.includes("\\") || value.startsWith(".")) {
    return resolve(value);
  }
  return findExecutable(value);
}

function readMacAppVersion(appPath) {
  const infoPlist = join(appPath, "Contents", "Info.plist");
  const result = spawnSync(
    "/usr/bin/plutil",
    ["-extract", "CFBundleShortVersionString", "raw", "-o", "-", infoPlist],
    { encoding: "utf8", timeout: 5_000, maxBuffer: 64 * 1024 },
  );
  const version = result.stdout?.trim();
  if (result.status !== 0 || !/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version ?? "")) {
    throw new Error(
      `could not read CFBundleShortVersionString from ${infoPlist}`,
    );
  }
  return version;
}

function discoverLoginPath() {
  if (process.platform === "win32") {
    return mergeSearchPaths(
      process.env.PATH,
      process.env.APPDATA ? join(process.env.APPDATA, "npm") : "",
      process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "npm") : "",
      process.env.USERPROFILE ? join(process.env.USERPROFILE, ".volta", "bin") : "",
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

  if (process.platform === "win32") {
    for (const directory of [
      process.env.APPDATA ? join(process.env.APPDATA, "npm") : null,
      process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "npm") : null,
      process.env.USERPROFILE ? join(process.env.USERPROFILE, ".volta", "bin") : null,
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
    ]) add(candidate);
  }

  if (process.platform !== "win32") {
    const nvmVersions = join(homedir(), ".nvm", "versions", "node");
    try {
      const versions = await readdir(nvmVersions);
      versions.sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
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

async function findWindowsApp() {
  const candidates = [];
  const add = (candidate) => {
    if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
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
        await readElectronFuseFromBinary(
          candidate,
          NODE_CLI_INSPECT_FUSE_INDEX,
        ) === "on"
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
  return readElectronFuseFromBinary(framework, fuseIndex);
}

async function readElectronFuseFromBinary(binaryPath, fuseIndex) {
  const handle = await openFile(binaryPath, "r");
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
        if (schema !== 1 || count <= fuseIndex) return "unsupported";
        if (window.length < header + 2 + count) {
          overlap = window.subarray(sentinelIndex);
          continue;
        }
        const value = window[header + 2 + fuseIndex];
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
  const check = spawnSync("/usr/bin/osascript", [
    "-e",
    'application id "com.openai.codex" is running',
  ], { encoding: "utf8" });
  return check.status === 0 && check.stdout.trim() === "true";
}

async function createMacShellEnvironment(adapterDirectory) {
  const proxyDirectory = await mkdtemp(join(tmpdir(), "spine-app-shell-"));
  const originalZdotdir = process.env.ZDOTDIR || homedir();
  const quote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
  const quotedProxy = quote(proxyDirectory);
  const quotedAdapterDirectory = quote(adapterDirectory);
  const startupFiles = [
    ".zshenv",
    ".zprofile",
    ".zshrc",
    ".zlogin",
    ".zlogout",
  ];

  for (const name of startupFiles) {
    const originalFile = join(originalZdotdir, name);
    const sourceOriginal = originalFile === join(proxyDirectory, name)
      ? ""
      : `if [[ -r ${quote(originalFile)} ]]; then\n  source ${quote(originalFile)}\nfi\n`;
    await writeFile(
      join(proxyDirectory, name),
      `${sourceOriginal}export ZDOTDIR=${quotedProxy}\n` +
        `_spine_app_adapter_dir=${quotedAdapterDirectory}\n` +
        `case ":\${PATH:-}:" in\n` +
        `  *:"\${_spine_app_adapter_dir}":*) ;;\n` +
        `  *) export PATH="\${_spine_app_adapter_dir}:\${PATH:-}" ;;\n` +
        `esac\n` +
        `unset _spine_app_adapter_dir\n`,
      "utf8",
    );
  }

  process.once("exit", () => {
    try { rmSync(proxyDirectory, { recursive: true, force: true }); } catch {}
  });
  return { ZDOTDIR: proxyDirectory };
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
  ];
  if (process.platform === "darwin") {
    const openArguments = ["-n"];
    for (const name of [
      "PATH",
      "ZDOTDIR",
      "CODEX_CLI_PATH",
      "SPINE_CODEX_BINARY",
      "SPINE_CODEX_SHIM_NODE",
    ]) {
      if (appEnvironment[name] != null) {
        openArguments.push("--env", `${name}=${appEnvironment[name]}`);
      }
    }
    openArguments.push("-a", appPath);
    if (deepLink) openArguments.push(deepLink);
    openArguments.push("--args", ...electronArguments);
    const child = spawn("/usr/bin/open", openArguments, { stdio: "inherit" });
    const status = await new Promise((resolve) => child.once("exit", resolve));
    if (status !== 0) fail(`open exited with status ${status}`);
    return null;
  }

  if (mainInspectorPort != null) {
    electronArguments.unshift(
      `--inspect-brk=127.0.0.1:${mainInspectorPort}`,
    );
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

async function waitForMainHookReady(statusPath, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  let lastState = "not reported";
  while (Date.now() < deadline) {
    try {
      const status = JSON.parse(await readFile(statusPath, "utf8"));
      lastState = status.state ?? "invalid";
      if (status.state === "ready") {
        if (status.rendererRecovery !== true) {
          throw new Error(
            "the main-process hook did not install renderer crash recovery",
          );
        }
        return status;
      }
      if (status.state === "incompatible") {
        throw new Error(`incompatible Codex bundle: ${status.reason ?? "unknown structure"}`);
      }
    } catch (error) {
      if (error?.code !== "ENOENT" && !/Unexpected end of JSON input/.test(error?.message ?? "")) {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    "SpineCodex SSH compatibility hook did not become ready " +
      `(last state: ${lastState}). The Codex Desktop build did not load ` +
      "the main-process preload; no renderer code was injected.",
  );
}

function fail(message) {
  console.error(`spine-app: ${message}`);
  process.exit(1);
}
