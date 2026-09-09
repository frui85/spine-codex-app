import { open, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const hook = require("../spine-electron-main-hook.cjs");
const MAX_HEADER_BYTES = 64 * 1024 * 1024;
const VERSION_MARKER = "codex-app-server-version-unsupported:";
const CLI_SELECTOR_MARKER =
  "Unable to locate the Codex CLI binary. Set CODEX_CLI_PATH or ensure the Electron resources include bin/codex.";

export async function inspectDesktopBundleContract(appPath, options = {}) {
  const platform = options.platform ?? process.platform;
  const archivePath = options.archivePath ?? (
    platform === "darwin"
      ? join(appPath, "Contents", "Resources", "app.asar")
      : join(dirname(appPath), "resources", "app.asar")
  );
  const patchers = options.patchers ?? defaultPatchers();
  const minimum = options.minimum ?? hook.DEFAULT_MIN_SPINE_VERSION;
  const archive = await readAsarIndex(archivePath);
  const candidates = archive.entries
    .filter((entry) => /^\.vite\/build\/(?:main-|src-)[A-Za-z0-9_-]+\.js$/.test(entry.path));
  const mainMatches = [];
  const versionMatches = [];
  const cliSelectorMatches = [];

  try {
    for (const entry of candidates) {
      const source = await archive.read(entry);
      const main = patchers.main(entry.path, source, minimum);
      if (typeof main === "string") mainMatches.push(entry.path);
      const version = patchers.version(entry.path, source, minimum);
      if (typeof version === "string") versionMatches.push(entry.path);
      const cliSelector = patchers.cliSelector(entry.path, source, minimum);
      if (typeof cliSelector === "string") cliSelectorMatches.push(entry.path);
    }
  } finally {
    await archive.close();
  }

  if (
    mainMatches.length !== 1 ||
    versionMatches.length !== 1 ||
    cliSelectorMatches.length !== 1 ||
    versionMatches[0] !== cliSelectorMatches[0]
  ) {
    throw new Error(
      "Codex Desktop bundle contract mismatch: " +
      `main=${mainMatches.length}, version=${versionMatches.length}, ` +
      `cli-selector=${cliSelectorMatches.length}, shared=` +
      `${versionMatches[0] === cliSelectorMatches[0]}`,
    );
  }
  return {
    status: "compatible",
    archivePath,
    mainBundle: mainMatches[0],
    versionBundle: versionMatches[0],
    cliSelectorBundle: cliSelectorMatches[0],
    candidateBundles: candidates.map((entry) => entry.path),
  };
}

function defaultPatchers() {
  return {
    main: hook.patchMainBundleCandidateSource,
    version(filename, source, minimum) {
      if (!hook.isSharedBundleFilename(filename) || !source.includes(VERSION_MARKER)) {
        return null;
      }
      return hook.patchVersionCompatibilitySource(source, minimum);
    },
    cliSelector(filename, source) {
      if (!hook.isSharedBundleFilename(filename) || !source.includes(CLI_SELECTOR_MARKER)) {
        return null;
      }
      return hook.patchLocalCliSelectorSource(source);
    },
  };
}

async function readAsarIndex(path) {
  const metadata = await stat(path);
  const handle = await open(path, "r");
  try {
    const prefix = await readExact(handle, 16, 0);
    const headerSize = prefix.readUInt32LE(4);
    const jsonSize = prefix.readUInt32LE(12);
    if (
      headerSize < 8 ||
      jsonSize === 0 ||
      jsonSize > MAX_HEADER_BYTES ||
      jsonSize + 8 > headerSize
    ) {
      throw new Error("Codex Desktop app.asar has an invalid header");
    }
    const header = JSON.parse((await readExact(handle, jsonSize, 16)).toString("utf8"));
    const dataOffset = 8 + headerSize;
    const entries = [];
    walkAsarFiles(header, "", entries);
    return {
      entries,
      async read(entry) {
        const offset = dataOffset + Number(entry.offset);
        if (
          !Number.isSafeInteger(offset) ||
          !Number.isSafeInteger(entry.size) ||
          offset < dataOffset ||
          entry.size < 0 ||
          offset + entry.size > metadata.size
        ) {
          throw new Error(`Codex Desktop app.asar entry is invalid: ${entry.path}`);
        }
        return (await readExact(handle, entry.size, offset)).toString("utf8");
      },
      close: () => handle.close(),
    };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

function walkAsarFiles(node, prefix, entries) {
  for (const [name, value] of Object.entries(node?.files ?? {})) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (value?.files) {
      walkAsarFiles(value, path, entries);
    } else if (value?.size != null && value?.offset != null && !value.unpacked) {
      entries.push({ path, size: Number(value.size), offset: value.offset });
    }
  }
}

async function readExact(handle, size, position) {
  const buffer = Buffer.alloc(size);
  let read = 0;
  while (read < size) {
    const result = await handle.read(buffer, read, size - read, position + read);
    if (result.bytesRead === 0) throw new Error("Codex Desktop app.asar ended unexpectedly");
    read += result.bytesRead;
  }
  return buffer;
}
