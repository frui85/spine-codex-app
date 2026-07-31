import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const metadata = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const launcher = await readFile(new URL("spine-app.mjs", root), "utf8");
const renderer = await readFile(new URL("spine-view.js", root), "utf8");
const builder = await readFile(new URL("scripts/build-macos-release.mjs", root), "utf8");

test("public release version tracks SpineCodex 0.2.1", () => {
  assert.equal(metadata.version, "0.2.1");
  assert.match(launcher, /APP_VERSION = "0\.2\.1"/);
  assert.match(launcher, /MIN_SPINE_CODEX_VERSION = "0\.2\.1"/);
  assert.match(renderer, /VERSION = "0\.2\.1"/);
});

test("release builder bundles only wrapper files and a pinned Node runtime", () => {
  assert.match(builder, /NODE_VERSION = "v22\.23\.2"/);
  assert.match(builder, /nodejs\.org\/dist/);
  assert.doesNotMatch(builder, /@spinejit|GhabiX|SpineCodex\/releases|npm pack/);
  assert.deepEqual(metadata.dependencies, undefined);
  assert.deepEqual(metadata.optionalDependencies, undefined);
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
});
