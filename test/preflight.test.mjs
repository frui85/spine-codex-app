import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = join(ROOT, "spine-app");
const LAUNCHER = join(ROOT, "spine-app.mjs");
const MISSING_APP = join(tmpdir(), "spine-app-missing.app");

test("shell entry explains how to install Node.js", () => {
  const result = spawnSync(ENTRY, ["--diagnose"], {
    encoding: "utf8",
    env: { ...process.env, PATH: "/usr/bin:/bin" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Node\.js was not found/);
  assert.match(result.stderr, /Node\.js 22 or newer/);
});

test("doctor reports invalid SpineCodex and App together without a stack", () => {
  const result = spawnSync(
    process.execPath,
    [
      LAUNCHER,
      "--diagnose",
      "--spine-codex",
      join(tmpdir(), "spine-app-missing-cli"),
      "--app",
      MISSING_APP,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, PATH: "/usr/bin:/bin", SPINE_CODEX_BINARY: "" },
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stdout, /SpineCodex: .*spine-app-missing-cli is not executable/);
  assert.match(result.stdout, /is not a valid Codex Desktop installation/);
  assert.match(result.stdout, /chatgpt\.com\/download/);
  assert.doesNotMatch(result.stdout + result.stderr, /node:internal|\n\s+at async /);
});

test("doctor rejects SpineCodex 0.2.1 below the release compatibility line", async () => {
  const directory = await mkdtemp(join(tmpdir(), "spine-app-test-"));
  const binary = join(directory, "spine-codex");
  try {
    await writeFile(binary, "#!/bin/sh\necho 'codex-cli 0.2.1'\n", "utf8");
    await chmod(binary, 0o755);
    const result = spawnSync(
      process.execPath,
      [LAUNCHER, "--diagnose", "--spine-codex", binary, "--app", MISSING_APP],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 1);
    assert.match(result.stdout, /0\.2\.1 is older than required 0\.2\.2/);
    assert.match(result.stdout, /npm install -g @spinejit\/spine-codex@latest/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("version command does not require installed dependencies", () => {
  const result = spawnSync(process.execPath, [LAUNCHER, "--version"], {
    encoding: "utf8",
    env: { ...process.env, PATH: "/usr/bin:/bin" },
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "spine-app 0.3.3.5");
});

test("JSON diagnosis has stable version, protocol, Desktop, and remote fields", async () => {
  const directory = await mkdtemp(join(tmpdir(), "spine-app-json-"));
  const binary = join(directory, "spine-codex");
  try {
    await writeFile(binary, `#!/usr/bin/env node
import { createInterface } from "node:readline";
if (process.argv.includes("--version")) {
  console.log("codex-cli 0.147.0");
  process.exit(0);
}
const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.id === 1) console.log(JSON.stringify({ id: 1, result: {} }));
  if (message.id === 2 || message.id === 3) {
    console.log(JSON.stringify({ id: message.id, result: {} }));
  }
});
`, "utf8");
    await chmod(binary, 0o755);
    const result = spawnSync(
      process.execPath,
      [
        LAUNCHER,
        "--diagnose",
        "--json",
        "--spine-codex",
        binary,
        "--app",
        MISSING_APP,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 1);
    assert.equal(result.stderr, "");
    const diagnosis = JSON.parse(result.stdout);
    assert.equal(diagnosis.schemaVersion, 1);
    assert.equal(diagnosis.app.version, "0.3.3.5");
    assert.equal(diagnosis.codexDesktop.inspectableClone, null);
    assert.deepEqual(
      {
        minimum: diagnosis.spineCodex.minimumVersion,
        recommended: diagnosis.spineCodex.recommendedVersion,
        compatibility: diagnosis.spineCodex.validatedCompatibilityVersion,
        mode: diagnosis.spineCodex.mode,
        product: diagnosis.spineCodex.productVersion,
        protocol: diagnosis.spineCodex.appsProtocol.mode,
      },
      {
        minimum: "0.2.2",
        recommended: "0.3.3",
        compatibility: "0.147.0",
        mode: "compatibility-only",
        product: null,
        protocol: "native",
      },
    );
    assert.equal(diagnosis.codexDesktop.version, null);
    assert.equal(diagnosis.codexDesktop.validatedBuild, null);
    assert.equal(diagnosis.remote.minimumSpineCodexVersion, "0.2.2");
    assert.match(diagnosis.renderer.sha256, /^[0-9a-f]{64}$/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
