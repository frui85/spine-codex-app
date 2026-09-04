#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const metadata = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
const version = metadata.spineAppVersion;
const desktopVersion = metadata.codexDesktopVersion;
const tag = process.argv[2];

if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version)) {
  throw new Error(`package.json spineAppVersion is invalid: ${String(version)}`);
}
if (typeof metadata.spineCodexVersion !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(metadata.spineCodexVersion)) {
  throw new Error(
    `package.json spineCodexVersion is invalid: ${String(metadata.spineCodexVersion)}`,
  );
}
if (typeof desktopVersion !== "string" ||
    !/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(desktopVersion)) {
  throw new Error(
    `package.json codexDesktopVersion is invalid: ${String(desktopVersion)}`,
  );
}
if (version !== desktopVersion) {
  throw new Error(
    `release version ${version} must exactly match Codex Desktop ${desktopVersion}`,
  );
}
if (tag != null && tag !== `v${version}`) {
  throw new Error(`tag ${String(tag)} does not match source version v${version}`);
}

process.stdout.write(`${version}\n`);
