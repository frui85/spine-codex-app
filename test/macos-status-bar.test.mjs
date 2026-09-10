import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
test("native menu language resolution, persistence, and live status translation", {
  skip: process.platform !== "darwin", timeout: 120_000,
}, async () => {
  const dir = await mkdtemp(join(tmpdir(), "spine-menu-test-"));
  try {
    const source = await readFile(join(root, "scripts/macos/status-bar.swift"), "utf8");
    const entry = "\nlet delegate = StatusBar()";
    assert.equal(source.split(entry).length, 2, "native helper entry point must be unique");
    const checks = await readFile(join(root, "test/fixtures/status-bar-checks.swift"), "utf8");
    await writeFile(join(dir, "main.swift"), source.split(entry)[0] + "\n" + checks);
    await exec("/usr/bin/xcrun", ["swiftc", "-swift-version", "5", "-module-cache-path", join(dir, "cache"), join(dir, "main.swift"), "-o", join(dir, "checks")], { timeout: 90_000 });
    const result = await exec(join(dir, "checks"), [], { timeout: 20_000 });
    assert.match(result.stdout, /Native menu language checks passed/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
