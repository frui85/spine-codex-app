import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  chmod,
  rm,
  readFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createMacShellEnvironment,
  verifyLocalAdapter,
} from "../lib/mac-shell-environment.mjs";
test(
  "adapter is first even when user zprofile leaves it behind the real CLI",
  { skip: process.platform !== "darwin" },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "spine-shell-test-"));
    let proxy;
    try {
      const original = join(root, "config");
      const adapter = join(root, "adapter");
      const real = join(root, "real");
      for (const dir of [original, adapter, real]) await mkdir(dir);
      for (const dir of [adapter, real]) {
        const file = join(dir, "spine-codex");
        await writeFile(file, "#!/bin/sh\nexit 0\n");
        await chmod(file, 0o755);
      }
      const config = `export PATH='${real}:${adapter}:/usr/bin:/bin'\n`;
      await writeFile(join(original, ".zprofile"), config);
      proxy = await createMacShellEnvironment(adapter, {
        env: { SHELL: "/bin/zsh" },
        root,
        originalDirectory: original,
      });
      assert.equal(
        await verifyLocalAdapter(join(adapter, "spine-codex"), {
          ...process.env,
          SHELL: "/bin/zsh",
          ...proxy.env,
        }),
        join(adapter, "spine-codex"),
      );
      assert.equal(await readFile(join(original, ".zprofile"), "utf8"), config);
    } finally {
      await proxy?.dispose();
      await rm(root, { recursive: true, force: true });
    }
  },
);
test("unsupported shells cannot silently bypass adapter", async () => {
  await assert.rejects(
    createMacShellEnvironment("/tmp/x", { env: { SHELL: "/bin/bash" } }),
    /zsh/,
  );
});
