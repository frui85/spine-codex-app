import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  inspectSpineCodexIdentity,
  parseCliVersion,
  probeAppsProtocol,
} from "../lib/spine-codex-compatibility.mjs";

test("parses the Codex compatibility identity from CLI output", () => {
  assert.equal(parseCliVersion("codex-cli 0.147.0"), "0.147.0");
  assert.equal(parseCliVersion("warning\nspine-codex v0.2.2\n"), "0.2.2");
  assert.equal(parseCliVersion("invalid"), null);
});

test("distinguishes legacy, dual, and compatibility-only identities", async () => {
  const directory = await mkdtemp(join(tmpdir(), "spine-identity-"));
  try {
    const legacyBinary = join(directory, "legacy", "bin", "spine-codex");
    await mkdir(join(directory, "legacy", "bin"), { recursive: true });
    await writeFile(legacyBinary, "", "utf8");
    assert.deepEqual(await inspectSpineCodexIdentity(legacyBinary, "0.2.2"), {
      mode: "legacy",
      productVersion: "0.2.2",
      productVersionSource: "legacy-cli-output",
      productPackagePath: null,
      compatibilityVersion: "0.2.2",
    });

    const packageRoot = join(directory, "dual", "node_modules", "@spinejit", "spine-codex");
    const packageBinary = join(packageRoot, "bin", "codex.js");
    const linkedBinary = join(directory, "dual", "bin", "spine-codex");
    await mkdir(join(packageRoot, "bin"), { recursive: true });
    await mkdir(join(directory, "dual", "bin"), { recursive: true });
    await writeFile(
      join(packageRoot, "package.json"),
      JSON.stringify({ name: "@spinejit/spine-codex", version: "0.3.2" }),
      "utf8",
    );
    await writeFile(packageBinary, "", "utf8");
    await symlink(packageBinary, linkedBinary);
    const dual = await inspectSpineCodexIdentity(linkedBinary, "0.147.0");
    assert.equal(dual.mode, "dual");
    assert.equal(dual.productVersion, "0.3.2");
    assert.equal(dual.compatibilityVersion, "0.147.0");
    assert.equal(
      await realpath(dual.productPackagePath),
      await realpath(join(packageRoot, "package.json")),
    );

    assert.deepEqual(await inspectSpineCodexIdentity(legacyBinary, "0.147.0"), {
      mode: "compatibility-only",
      productVersion: null,
      productVersionSource: "unavailable",
      productPackagePath: null,
      compatibilityVersion: "0.147.0",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("reports native, legacy-fallback, and unavailable Apps protocols", async () => {
  const directory = await mkdtemp(join(tmpdir(), "spine-protocol-"));
  const server = join(directory, "fake-spine-codex");
  try {
    await writeFile(server, `#!/usr/bin/env node
import { createInterface } from "node:readline";
const mode = process.env.SPINE_TEST_PROTOCOL_MODE;
if (mode === "unavailable") process.exit(17);
const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.id === 1) {
    console.log(JSON.stringify({ id: 1, result: { userAgent: "fixture" } }));
  } else if (message.id === 2 || message.id === 3) {
    const legacy = mode === "legacy";
    console.log(JSON.stringify(legacy
      ? { id: message.id, error: { code: -32601, message: "method not found" } }
      : { id: message.id, result: {} }));
  }
});
`, "utf8");
    await chmod(server, 0o755);

    const previous = process.env.SPINE_TEST_PROTOCOL_MODE;
    try {
      process.env.SPINE_TEST_PROTOCOL_MODE = "native";
      assert.equal((await probeAppsProtocol(server, { timeoutMs: 2_000 })).mode, "native");
      process.env.SPINE_TEST_PROTOCOL_MODE = "legacy";
      assert.equal(
        (await probeAppsProtocol(server, { timeoutMs: 2_000 })).mode,
        "legacy-fallback",
      );
      process.env.SPINE_TEST_PROTOCOL_MODE = "unavailable";
      assert.equal((await probeAppsProtocol(server, { timeoutMs: 2_000 })).mode, "unavailable");
    } finally {
      if (previous == null) delete process.env.SPINE_TEST_PROTOCOL_MODE;
      else process.env.SPINE_TEST_PROTOCOL_MODE = previous;
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
