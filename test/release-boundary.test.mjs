import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const metadata = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const launcher = await readFile(new URL("spine-app.mjs", root), "utf8");
const renderer = await readFile(new URL("spine-view.js", root), "utf8");
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

test("public release version tracks SpineCodex 0.2.2", () => {
  assert.equal(metadata.version, "0.2.2");
  assert.match(launcher, /APP_VERSION = "0\.2\.2"/);
  assert.match(launcher, /MIN_SPINE_CODEX_VERSION = "0\.2\.2"/);
  assert.match(renderer, /VERSION = "0\.2\.2"/);
});

test("release builder bundles only wrapper files and a pinned Node runtime", () => {
  assert.match(builder, /NODE_VERSION = "v22\.23\.2"/);
  assert.match(builder, /nodejs\.org\/dist/);
  assert.doesNotMatch(builder, /@spinejit|GhabiX|SpineCodex\/releases|npm pack/);
  assert.deepEqual(metadata.dependencies, undefined);
  assert.deepEqual(metadata.optionalDependencies, undefined);
});

test("Windows portable build contains native launchers but no upstream binary", () => {
  assert.equal(metadata.scripts["build:windows"], "node scripts/build-windows-release.mjs --arch x64");
  assert.match(windowsBuilder, /NODE_VERSION = "v22\.23\.2"/);
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
});

test("no-argument launch does not create a root workspace task", () => {
  assert.match(launcher, /workspace: null/);
  assert.match(launcher, /args\.workspace == null\s*\? null/);
  assert.match(launcher, /if \(deepLink\) openArguments\.push\(deepLink\)/);
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
});
