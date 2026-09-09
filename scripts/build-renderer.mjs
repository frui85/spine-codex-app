#!/usr/bin/env node

import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, "spine-view.js");
export const RENDERER_MODULES = Object.freeze([
  "00-runtime.jsfrag",
  "10-protocol-cache.jsfrag",
  "20-session.jsfrag",
  "30-spawn.jsfrag",
  "40-tree.jsfrag",
  "50-spawn-dom.jsfrag",
  "60-detail-dom.jsfrag",
  "70-tree-dom.jsfrag",
  "80-settings.jsfrag",
  "90-lifecycle.jsfrag",
]);

export async function readRendererModules(root = ROOT) {
  const fragments = await Promise.all(
    RENDERER_MODULES.map((name) => readFile(join(root, "renderer", name))),
  );
  const separator = Buffer.from("\n");
  return Buffer.concat(
    fragments.flatMap((fragment, index) =>
      index === fragments.length - 1 ? [fragment] : [fragment, separator]),
  );
}

async function main(arguments_) {
  const checkOnly = arguments_.length === 1 && arguments_[0] === "--check";
  if (arguments_.length > 0 && !checkOnly) {
    throw new Error("usage: node scripts/build-renderer.mjs [--check]");
  }
  const generated = await readRendererModules();
  if (checkOnly) {
    const current = await readFile(OUTPUT);
    if (!current.equals(generated)) {
      throw new Error(
        "spine-view.js is stale; run `npm run build:renderer` and commit the result",
      );
    }
    process.stdout.write(
      `Renderer artifact is current (${RENDERER_MODULES.length} modules, ${generated.length} bytes).\n`,
    );
  } else {
    const temporary = `${OUTPUT}.${process.pid}.tmp`;
    try {
      await writeFile(temporary, generated);
      await rename(temporary, OUTPUT);
    } finally {
      await rm(temporary, { force: true });
    }
    process.stdout.write(
      `Generated spine-view.js (${RENDERER_MODULES.length} modules, ${generated.length} bytes).\n`,
    );
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main(process.argv.slice(2));
}
