import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const metadata = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const compatibility = JSON.parse(
  await readFile(new URL("compatibility.json", root), "utf8"),
);
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
const mainHookReadiness = await readFile(
  new URL("lib/main-hook-readiness.mjs", root),
  "utf8",
);
const appServerProtocolAdapter = await readFile(
  new URL("lib/app-server-protocol-adapter.mjs", root),
  "utf8",
);

test("wrapper 0.3.3.4 separates minimum, recommended, and compatibility identities", () => {
  assert.equal(metadata.version, "0.3.3");
  assert.equal(metadata.spineAppVersion, "0.3.3.4");
  assert.equal(metadata.minimumSpineCodexVersion, "0.2.2");
  assert.equal(metadata.recommendedSpineCodexVersion, "0.3.3");
  assert.equal(metadata.validatedCodexCompatibilityVersion, "0.147.0");
  assert.deepEqual(metadata.validatedDesktopVersions, [
    "26.810.41047",
    "26.818.41509",
    "26.825.51511",
    "26.901.20858",
  ]);
  assert.match(launcher, /APP_VERSION = "0\.3\.3\.4"/);
  assert.match(launcher, /MIN_SPINE_CODEX_VERSION = "0\.2\.2"/);
  assert.match(launcher, /RECOMMENDED_SPINE_CODEX_VERSION = "0\.3\.3"/);
  assert.match(launcher, /VALIDATED_CODEX_COMPATIBILITY_VERSION = "0\.147\.0"/);
  assert.match(renderer, /VERSION = "0\.3\.3\.4"/);
  assert.equal(compatibility.spineCodexAppVersion, metadata.spineAppVersion);
  assert.deepEqual(compatibility.local, {
    minimumSpineCodexVersion: metadata.minimumSpineCodexVersion,
    recommendedSpineCodexVersion: metadata.recommendedSpineCodexVersion,
    validatedCodexCompatibilityVersion: metadata.validatedCodexCompatibilityVersion,
  });
  assert.equal(
    compatibility.remote.minimumSpineCodexVersion,
    metadata.minimumSpineCodexVersion,
  );
  assert.deepEqual(
    compatibility.codexDesktop.validatedVersions,
    metadata.validatedDesktopVersions,
  );
  assert.deepEqual(compatibility.notValidated[0], {
    component: "OpenAI Codex",
    version: "0.149.1",
    reason: "not a SpineCodex compatibility baseline",
  });
});

test("launcher keeps its macOS inspector startup delay self-contained", () => {
  assert.match(launcher, /for \(const milliseconds of \[50, 250, 750, 1_500\]\)/);
  assert.match(launcher, /await delay\(milliseconds\);/);
  assert.match(launcher, /child\.kill\("SIGUSR1"\)/);
  assert.match(
    launcher,
    /function delay\(milliseconds\) \{\s*return new Promise\(\(resolve\) => setTimeout\(resolve, milliseconds\)\);\s*\}/s,
  );
});

test("release builder bundles only wrapper files and a pinned Node runtime", () => {
  assert.equal(
    metadata.scripts["build:macos"],
    "node scripts/build-renderer.mjs --check && node scripts/build-macos-release.mjs --all",
  );
  assert.match(builder, /NODE_VERSION = "v22\.23\.2"/);
  assert.match(builder, /metadata\.spineAppVersion/);
  assert.match(builder, /valueAfter\("--version"\)/);
  assert.match(builder, /nodejs\.org\/dist/);
  assert.match(builder, /\/usr\/bin\/qlmanage/);
  assert.match(builder, /"compatibility\.json"/);
  assert.match(builder, /lib", "spine-codex-compatibility\.mjs/);
  assert.match(builder, /lib", "desktop-bundle-contract\.mjs/);
  assert.match(builder, /lib", "main-hook-readiness\.mjs/);
  assert.match(builder, /await rm\(extracted, \{ recursive: true, force: true \}\)/);
  assert.match(builder, /await rm\(nodeArchive, \{ force: true \}\)/);
  assert.match(builder, /await rm\(app, \{ recursive: true, force: true \}\)/);
  assert.doesNotMatch(builder, /@spinejit|GhabiX|SpineCodex\/releases|npm pack/);
  assert.deepEqual(metadata.dependencies, undefined);
  assert.deepEqual(metadata.optionalDependencies, undefined);
});

test("Windows portable build contains native launchers but no upstream binary", () => {
  assert.equal(
    metadata.scripts["build:windows"],
    "node scripts/build-renderer.mjs --check && node scripts/build-windows-release.mjs --arch x64",
  );
  assert.match(windowsBuilder, /NODE_VERSION = "v22\.23\.2"/);
  assert.match(windowsBuilder, /metadata\.spineAppVersion/);
  assert.match(
    windowsBuilder,
    /MIN_SPINE_CODEX_VERSION = metadata\.minimumSpineCodexVersion/,
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
  assert.match(windowsBuilder, /lib", "main-hook-readiness\.mjs/);
  assert.match(windowsBuilder, /lib", "app-server-output-filter\.mjs/);
  assert.match(windowsBuilder, /lib", "app-server-protocol-adapter\.mjs/);
  assert.match(windowsBuilder, /lib", "spine-codex-compatibility\.mjs/);
  assert.match(windowsBuilder, /lib", "desktop-bundle-contract\.mjs/);
  assert.match(windowsBuilder, /"compatibility\.json"/);
  assert.match(builder, /lib", "app-server-protocol-adapter\.mjs/);
  assert.match(appServerProtocolAdapter, /APP_INSTALLED_METHOD = "app\/installed"/);
  assert.match(appServerProtocolAdapter, /APP_READ_METHOD = "app\/read"/);
  assert.match(appServerProtocolAdapter, /APP_LIST_METHOD = "app\/list"/);
  assert.match(launcher, /--inspect-brk=127\.0\.0\.1:/);
  assert.match(launcher, /--inspect-port=127\.0\.0\.1:/);
  assert.match(launcher, /injectMainProcessHook/);
  assert.match(launcher, /needsMainProcessInspector/);
  assert.match(launcher, /resolveMacOsExecutable/);
  assert.match(mainInspector, /Debugger\.evaluateOnCallFrame/);
  assert.match(mainInspector, /Debugger\.resume/);
});

test("no-argument launch does not create a root workspace task", () => {
  assert.match(launcher, /workspace: null/);
  assert.match(launcher, /args\.workspace == null\s*\? null/);
  assert.match(launcher, /if \(deepLink\) openArguments\.push\(deepLink\)/);
});

test("renderer injection survives Electron renderer replacement", () => {
  assert.match(launcher, /SPINE_CODEX_LOCAL_CLI_PATH: LOCAL_CLI_SHIM/);
  assert.match(
    launcher,
    /`SPINE_CODEX_LOCAL_CLI_PATH=\$\{appEnvironment\.SPINE_CODEX_LOCAL_CLI_PATH\}`/,
  );
  assert.match(
    launcher,
    /`SPINE_CODEX_SHIM_NODE=\$\{appEnvironment\.SPINE_CODEX_SHIM_NODE\}`/,
  );
  assert.match(mainHook, /SPINE_CODEX_LOCAL_CLI_PATH/);
  assert.match(mainHook, /patchLocalCliSelectorSource/);
  assert.match(launcher, /SPINE_CODEX_RENDERER_PATH:/);
  assert.match(launcher, /SPINE_CODEX_RENDERER_SHA256:/);
  assert.match(mainHookReadiness, /rendererRecovery !== true/);
  assert.match(mainHook, /web-contents-created/);
  assert.match(mainHook, /did-finish-load/);
  assert.match(mainHook, /executeJavaScript\(payload\.source, false\)/);
  assert.match(mainHook, /url\.protocol === "app:"/);
  assert.match(mainHook, /url\.pathname === "\/index\.html"/);
  assert.match(mainHook, /initialRoute/);
  assert.match(mainHook, /\/avatar-overlay/);
  assert.match(mainHook, /SHA-256 mismatch/);
  assert.doesNotMatch(mainHook, /setInterval\(/);
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
  assert.match(launcher, /Electron main-process Inspector fuse is \$\{nodeCliInspectFuse\}/);
  assert.match(launcher, /The launched Desktop process was left running/);
  assert.match(launcher, /NODE_CLI_INSPECT_FUSE_INDEX = 3/);
  assert.match(launcher, /Codex was not allowed to/);
  assert.match(launcher, /timeoutMs: 20_000/);
  assert.match(launcher, /progressGraceMs: 10_000/);
  assert.match(launcher, /hardTimeoutMs: 30_000/);
  assert.match(launcher, /finalGraceMs: 500/);
  assert.match(mainHookReadiness, /MAIN_HOOK_PROGRESS_STATES/);
  assert.match(mainHookReadiness, /main-process hook loaded/);
  assert.match(mainHookReadiness, /main-process preload did not report startup/);
  assert.doesNotMatch(mainHookReadiness, /no renderer code was injected/);
});
