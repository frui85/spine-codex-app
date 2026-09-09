#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function renderReleaseNotes(source, { repository, ref, version }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error(`invalid GitHub repository: ${repository}`);
  }
  if (!/^v\d+\.\d+\.\d+(?:\.\d+)?$/.test(ref)) {
    throw new Error(`invalid release ref: ${ref}`);
  }
  if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version)) {
    throw new Error(`invalid release version: ${version}`);
  }

  const filename = `RELEASE_NOTES_v${version}_ZH.md`;
  const relativeLink = `[中文发布说明](${filename})`;
  const occurrences = source.split(relativeLink).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `expected exactly one Chinese release-notes link, found ${occurrences}`,
    );
  }
  const absoluteLink =
    `[中文发布说明](https://github.com/${repository}/blob/${ref}/docs/${filename})`;
  return source.replace(relativeLink, absoluteLink);
}

async function main() {
  const [sourcePath, outputPath, repository, ref, version] = process.argv.slice(2);
  if (!sourcePath || !outputPath || !repository || !ref || !version) {
    throw new Error(
      "usage: prepare-release-notes SOURCE OUTPUT OWNER/REPO TAG VERSION",
    );
  }
  const source = await readFile(sourcePath, "utf8");
  const rendered = renderReleaseNotes(source, { repository, ref, version });
  await writeFile(outputPath, rendered, "utf8");
  process.stdout.write(`${basename(outputPath)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
