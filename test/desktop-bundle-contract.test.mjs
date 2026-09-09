import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { inspectDesktopBundleContract } from "../lib/desktop-bundle-contract.mjs";

async function writeAsar(path, files) {
  let offset = 0;
  const root = { files: { ".vite": { files: { build: { files: {} } } } } };
  const contents = [];
  for (const [name, source] of Object.entries(files)) {
    const content = Buffer.from(source);
    root.files[".vite"].files.build.files[name] = {
      size: content.length,
      offset: String(offset),
    };
    contents.push(content);
    offset += content.length;
  }
  const json = Buffer.from(JSON.stringify(root));
  const prefix = Buffer.alloc(16);
  prefix.writeUInt32LE(json.length + 8, 4);
  prefix.writeUInt32LE(json.length, 12);
  await writeFile(path, Buffer.concat([prefix, json, ...contents]));
}

const patchers = {
  main: (_path, source) => source === "MAIN" ? "patched" : null,
  version: (_path, source) => source === "SHARED" ? "patched" : null,
  cliSelector: (_path, source) => source === "SHARED" ? "patched" : null,
};

test("accepts one main bundle and one shared version/selector bundle", async () => {
  const directory = await mkdtemp(join(tmpdir(), "spine-asar-"));
  const archivePath = join(directory, "app.asar");
  try {
    await writeAsar(archivePath, {
      "main-one.js": "MAIN",
      "src-shared.js": "SHARED",
      "src-runtime.js": "OTHER",
    });
    const result = await inspectDesktopBundleContract("unused", {
      archivePath,
      patchers,
    });
    assert.equal(result.status, "compatible");
    assert.equal(result.mainBundle, ".vite/build/main-one.js");
    assert.equal(result.versionBundle, ".vite/build/src-shared.js");
    assert.equal(result.cliSelectorBundle, ".vite/build/src-shared.js");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("fails closed for duplicate or split bundle contracts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "spine-asar-"));
  const archivePath = join(directory, "app.asar");
  try {
    await writeAsar(archivePath, {
      "main-one.js": "MAIN",
      "main-two.js": "MAIN",
      "src-version.js": "VERSION",
      "src-selector.js": "SELECTOR",
    });
    await assert.rejects(
      inspectDesktopBundleContract("unused", {
        archivePath,
        patchers: {
          main: patchers.main,
          version: (_path, source) => source === "VERSION" ? "patched" : null,
          cliSelector: (_path, source) => source === "SELECTOR" ? "patched" : null,
        },
      }),
      /main=2, version=1, cli-selector=1, shared=false/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
