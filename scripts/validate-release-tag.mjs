#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const metadata = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
const version = metadata.spineAppVersion;
const tag = process.argv[2];
const semverFields = [
  "minimumSpineCodexVersion",
  "recommendedSpineCodexVersion",
  "validatedCodexCompatibilityVersion",
];

if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version)) {
  throw new Error(`package.json spineAppVersion is invalid: ${String(version)}`);
}
for (const field of semverFields) {
  if (typeof metadata[field] !== "string" || !/^\d+\.\d+\.\d+$/.test(metadata[field])) {
    throw new Error(`package.json ${field} is invalid: ${String(metadata[field])}`);
  }
}
if (metadata.version !== metadata.recommendedSpineCodexVersion) {
  throw new Error("package version must match recommendedSpineCodexVersion");
}
if (!version.startsWith(`${metadata.recommendedSpineCodexVersion}.`)) {
  throw new Error("spineAppVersion must track the recommended SpineCodex release");
}
if (
  !Array.isArray(metadata.validatedDesktopVersions) ||
  metadata.validatedDesktopVersions.length === 0 ||
  metadata.validatedDesktopVersions.some(
    (value) => typeof value !== "string" || !/^\d+\.\d+\.\d+$/.test(value),
  )
) {
  throw new Error("package.json validatedDesktopVersions is invalid");
}
if (tag != null && tag !== `v${version}`) {
  throw new Error(`tag ${String(tag)} does not match source version v${version}`);
}

process.stdout.write(`${version}\n`);
