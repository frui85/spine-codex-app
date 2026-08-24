import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("Renderer modules deterministically reproduce the injection artifact", async () => {
  const result = spawnSync(
    process.execPath,
    [join(ROOT, "scripts", "build-renderer.mjs"), "--check"],
    { cwd: ROOT, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Renderer artifact is current \(10 modules, \d+ bytes\)/);

  const scriptUrl = new URL("../scripts/build-renderer.mjs", import.meta.url);
  const { readRendererModules, RENDERER_MODULES } = await import(scriptUrl);
  assert.equal(RENDERER_MODULES.length, 10);
  assert.deepEqual(
    await readRendererModules(ROOT),
    await readFile(join(ROOT, "spine-view.js")),
  );
});
