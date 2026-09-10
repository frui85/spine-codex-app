import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { renderReleaseNotes } from "../scripts/prepare-release-notes.mjs";

const root = new URL("../", import.meta.url);
const releaseWorkflow = await readFile(
  new URL(".github/workflows/release.yml", root),
  "utf8",
);
const disabledWindowsWorkflow = await readFile(
  new URL(".github/workflows/windows-release.yml.disabled", root),
  "utf8",
);
const releaseNotes = await readFile(
  new URL("docs/RELEASE_NOTES_v26.901.51231.2.md", root),
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
  const accepted = validate("v26.901.51231.2");
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(accepted.stdout.trim(), "26.901.51231.2");

  const rejected = validate("v0.3.3");
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /does not match source version v26\.901\.51231\.2/);
});

test("active release workflow is tag-driven and publishes macOS only", () => {
  assert.match(releaseWorkflow, /tags: \["v\*"\]/);
  assert.match(releaseWorkflow, /validate-release-tag\.mjs/);
  assert.match(releaseWorkflow, /build-macos-release\.mjs --all --version/);
  assert.match(releaseWorkflow, /notes_source="docs\/RELEASE_NOTES_v\$\{VERSION\}\.md"/);
  assert.match(releaseWorkflow, /prepare-release-notes\.mjs/);
  assert.match(releaseWorkflow, /gh release create .*--draft/);
  assert.match(releaseWorkflow, /gh release edit[\s\S]*--draft=false --latest/);
  assert.doesNotMatch(releaseWorkflow, /build-windows-release|windows-x64/);
  assert.match(releaseNotes, /^# SpineCodex App v26\.901\.51231\.2/m);
  assert.match(releaseNotes, /SpineCodex recommended baseline \| 0\.3\.3/);
});

test("release notes use a tag-pinned absolute Chinese link", () => {
  const rendered = renderReleaseNotes(releaseNotes, {
    repository: "frui85/spine-codex-app",
    ref: "v26.901.51231.2",
    version: "26.901.51231.2",
  });
  assert.match(
    rendered,
    /\[中文发布说明\]\(https:\/\/github\.com\/frui85\/spine-codex-app\/blob\/v26\.901\.51231\.2\/docs\/RELEASE_NOTES_v26\.901\.51231\.2_ZH\.md\)/,
  );
  assert.doesNotMatch(rendered, /\[中文发布说明\]\(RELEASE_NOTES_/);
});

test("release-note rendering fails closed when the expected link drifts", () => {
  assert.throws(
    () => renderReleaseNotes("# Notes\n", {
      repository: "frui85/spine-codex-app",
      ref: "v26.901.51231.2",
      version: "26.901.51231.2",
    }),
    /expected exactly one Chinese release-notes link/,
  );
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
