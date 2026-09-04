import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const metadata = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const launcher = await readFile(new URL("spine-app.mjs", root), "utf8");
const renderer = await readFile(new URL("spine-view.js", root), "utf8");
const mainHook = await readFile(
  new URL("spine-electron-main-hook.cjs", root),
  "utf8",
);
const builder = await readFile(new URL("scripts/build-macos-release.mjs", root), "utf8");
const windowsBuilder = await readFile(
  new URL("scripts/build-windows-release.mjs", root),
  "utf8",
);
const windowsLauncher = await readFile(
  new URL("scripts/windows/launcher.c", root),
  "utf8",
);
const windowsCliShim = await readFile(
  new URL("bin/spine-codex.mjs", root),
  "utf8",
);
const macosCliShim = await readFile(new URL("bin/spine-codex", root), "utf8");
const mainInspector = await readFile(
  new URL("lib/main-inspector.mjs", root),
  "utf8",
);
const rendererSupervisor = await readFile(
  new URL("lib/renderer-supervisor.mjs", root),
  "utf8",
);
const appServerProtocolAdapter = await readFile(
  new URL("lib/app-server-protocol-adapter.mjs", root),
  "utf8",
);

test("release version exactly tracks the supported Codex Desktop version", () => {
  assert.equal(metadata.version, "26.901.20858");
  assert.equal(metadata.spineAppVersion, "26.901.20858");
  assert.equal(metadata.codexDesktopVersion, "26.901.20858");
  assert.equal(metadata.spineCodexVersion, "0.3.3");
  assert.match(launcher, /APP_VERSION = "26\.901\.20858"/);
  assert.match(launcher, /SUPPORTED_DESKTOP_VERSION = "26\.901\.20858"/);
  assert.match(launcher, /MIN_SPINE_CODEX_VERSION = "0\.2\.2"/);
  assert.match(launcher, /MIN_CODEX_APP_SERVER_VERSION = "0\.141\.0"/);
  assert.match(launcher, /MIN_SPINE_CODEX_RELEASE = "0\.3\.3"/);
  assert.match(renderer, /VERSION = "26\.901\.20858"/);
  assert.match(launcher, /verified exact match/);
  assert.match(launcher, /unverified with release/);
});

test("release builder bundles only wrapper files and a pinned Node runtime", () => {
  assert.match(builder, /NODE_VERSION = "v22\.23\.2"/);
  assert.match(builder, /metadata\.spineAppVersion/);
  assert.match(builder, /valueAfter\("--version"\)/);
  assert.match(builder, /nodejs\.org\/dist/);
  assert.match(builder, /\/usr\/bin\/qlmanage/);
  assert.doesNotMatch(builder, /@spinejit|GhabiX|SpineCodex\/releases|npm pack/);
  assert.deepEqual(metadata.dependencies, undefined);
  assert.deepEqual(metadata.optionalDependencies, undefined);
});

test("Windows portable build contains native launchers but no upstream binary", () => {
  assert.equal(metadata.scripts["build:windows"], "node scripts/build-windows-release.mjs --arch x64");
  assert.match(windowsBuilder, /NODE_VERSION = "v22\.23\.2"/);
  assert.match(windowsBuilder, /metadata\.spineAppVersion/);
  assert.match(
    windowsBuilder,
    /MIN_SPINE_CODEX_VERSION = metadata\.spineCodexVersion/,
  );
  assert.match(
    windowsBuilder,
    /SpineCodex \$\{MIN_SPINE_CODEX_VERSION\} or newer installed separately/,
  );
  assert.doesNotMatch(
    windowsBuilder,
    /SpineCodex \$\{VERSION\} or newer installed separately/,
  );
  assert.match(windowsBuilder, /node-\$\{NODE_VERSION\}-win-\$\{ARCHITECTURE\}/);
  assert.match(windowsBuilder, /x86_64-w64-mingw32-gcc/);
  assert.match(windowsBuilder, /SpineCodex App\.exe/);
  assert.doesNotMatch(
    windowsBuilder,
    /@spinejit|GhabiX|SpineCodex\/releases|npm pack/,
  );
  assert.match(windowsLauncher, /CreateProcessW/);
  assert.match(windowsLauncher, /CREATE_NO_WINDOW/);
  assert.match(windowsCliShim, /SPINE_CODEX_BINARY/);
  assert.match(windowsCliShim, /"--disable",\s*"image_generation"/);
  assert.match(windowsCliShim, /createAppServerOutputFilter/);
  assert.match(windowsCliShim, /createAppServerProtocolAdapter/);
  assert.match(macosCliShim, /SPINE_CODEX_SHIM_NODE/);
  assert.match(macosCliShim, /spine-codex\.mjs/);
  assert.match(windowsBuilder, /lib", "main-inspector\.mjs/);
  assert.match(windowsBuilder, /lib", "renderer-supervisor\.mjs/);
  assert.match(windowsBuilder, /lib", "app-server-output-filter\.mjs/);
  assert.match(windowsBuilder, /lib", "app-server-protocol-adapter\.mjs/);
  assert.match(builder, /lib", "app-server-protocol-adapter\.mjs/);
  assert.match(builder, /lib", "renderer-supervisor\.mjs/);
  assert.match(appServerProtocolAdapter, /APP_INSTALLED_METHOD = "app\/installed"/);
  assert.match(appServerProtocolAdapter, /APP_READ_METHOD = "app\/read"/);
  assert.match(appServerProtocolAdapter, /APP_LIST_METHOD = "app\/list"/);
  assert.match(launcher, /--inspect-brk=127\.0\.0\.1:/);
  assert.match(launcher, /injectMainProcessHook/);
  assert.match(mainInspector, /Debugger\.evaluateOnCallFrame/);
  assert.match(mainInspector, /Debugger\.resume/);
});

test("no-argument launch does not create a root workspace task", () => {
  assert.match(launcher, /workspace: null/);
  assert.match(launcher, /args\.workspace == null\s*\? null/);
  assert.match(launcher, /if \(deepLink\) openArguments\.push\(deepLink\)/);
});

test("renderer injection survives Electron renderer replacement", () => {
  assert.match(launcher, /await superviseRenderer\(/);
  assert.match(rendererSupervisor, /Page\.addScriptToEvaluateOnNewDocument/);
  assert.match(rendererSupervisor, /Page\.loadEventFired/);
  assert.match(rendererSupervisor, /window\.__spineCodexSupervisorRevision/);
  assert.match(rendererSupervisor, /MAIN_RENDERER_ORIGIN = "app:\/\/-"/);
  assert.match(rendererSupervisor, /AVATAR_OVERLAY_ROUTE = "\/avatar-overlay"/);
  assert.match(rendererSupervisor, /lastEndpointSuccess/);
  assert.doesNotMatch(rendererSupervisor, /setInterval\(/);

  // Windows retains the older main-hook recovery path until its CLI selector
  // can also move to the external boundary.
  assert.match(mainHook, /SPINE_CODEX_LOCAL_CLI_PATH/);
  assert.match(mainHook, /patchLocalCliSelectorSource/);
  assert.match(mainHook, /web-contents-created/);
  assert.match(mainHook, /did-finish-load/);
  assert.match(mainHook, /executeJavaScript\(payload\.source, false\)/);
  assert.match(mainHook, /url\.protocol === "app:"/);
  assert.match(mainHook, /url\.pathname === "\/index\.html"/);
  assert.match(mainHook, /initialRoute/);
  assert.match(mainHook, /\/avatar-overlay/);
  assert.match(mainHook, /SHA-256 mismatch/);
});

test("macOS selects the local adapter without changing the SSH command", () => {
  assert.match(launcher, /CODEX_CLI_PATH: REMOTE_CLI_NAME/);
  assert.match(launcher, /await createMacShellEnvironment\(LOCAL_CLI_DIR\)/);
  assert.match(launcher, /ZDOTDIR/);
  assert.match(
    launcher,
    /export PATH="\\\$\{_spine_app_adapter_dir\}:\\\$\{PATH:-\}"/,
  );
  assert.match(launcher, /no Electron main-process hook required/);
  assert.match(windowsCliShim, /findSpineCodexBinary/);
  assert.match(windowsCliShim, /dirname\(candidate\) === ownDirectory/);
});

test("local dependency paths are discovered without translated UI labels", () => {
  assert.match(launcher, /kMDItemCFBundleIdentifier == 'com\.openai\.codex'/);
  assert.match(launcher, /discoverLoginPath/);
  assert.match(launcher, /\.nvm", "versions", "node/);
  assert.match(launcher, /\.volta", "bin", "spine-codex/);
  assert.match(launcher, /OpenAI\.ChatGPT-Desktop_2p2nqsd0c76g0/);
  assert.match(launcher, /Get-AppxPackage -Name \$name/);
  assert.match(launcher, /Get-AppxPackageManifest -Package/);
  assert.match(launcher, /application\.Executable/);
  assert.match(launcher, /Get-StartApps/);
  assert.doesNotMatch(launcher, /Get-StartApps -Name 'Codex'/);
  assert.match(launcher, /process\.platform === "win32"/);
  assert.match(launcher, /Inspector fuse marker \$\{nodeCliInspectFuse\}; runtime injection required/);
  assert.match(launcher, /!\["off", "removed"\]\.includes\(nodeCliInspectFuse\)/);
  assert.match(launcher, /NODE_CLI_INSPECT_FUSE_INDEX = 3/);
  assert.match(launcher, /Codex was not allowed to/);
  assert.match(launcher, /await superviseRenderer\(/);
});
