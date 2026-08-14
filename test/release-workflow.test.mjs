import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = new URL("../", import.meta.url);
const releaseWorkflow = await readFile(
  new URL(".github/workflows/release.yml", root),
  "utf8",
);
const disabledWindowsWorkflow = await readFile(
  new URL(".github/workflows/windows-release.yml.disabled", root),
  "utf8",
);
const validator = fileURLToPath(
  new URL("../scripts/validate-release-tag.mjs", import.meta.url),
);

function validate(tag) {
  return spawnSync(process.execPath, [validator, tag], {
    encoding: "utf8",
  });
}

test("release tag must match the wrapper source version", () => {
  const accepted = validate("v0.2.2.5");
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(accepted.stdout.trim(), "0.2.2.5");

  const rejected = validate("v0.2.2");
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /does not match source version v0\.2\.2\.5/);
});

test("active release workflow is tag-driven and publishes macOS only", () => {
  assert.match(releaseWorkflow, /tags: \["v\*"\]/);
  assert.match(releaseWorkflow, /validate-release-tag\.mjs/);
  assert.match(releaseWorkflow, /build-macos-release\.mjs --all --version/);
  assert.match(releaseWorkflow, /gh release create .*--draft/);
  assert.match(releaseWorkflow, /gh release edit[\s\S]*--draft=false --latest/);
  assert.doesNotMatch(releaseWorkflow, /build-windows-release|windows-x64/);
});

test("Windows workflow is complete but ignored by GitHub Actions", () => {
  assert.match(disabledWindowsWorkflow, /build-windows-release\.mjs/);
  assert.match(disabledWindowsWorkflow, /mingw-w64/);
  assert.match(disabledWindowsWorkflow, /gh release upload/);
  assert.ok(
    new URL(".github/workflows/windows-release.yml.disabled", root)
      .pathname.endsWith(".disabled"),
  );
});
