"use strict";

const Module = require("node:module");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_MIN_SPINE_VERSION = "0.2.2";
// Vite has emitted both `main--HASH.js` and `main-HASH.js` across Codex App
// releases. Treat every hashed main chunk as a candidate, then identify the
// real SSH-owning entrypoint by source structure instead of its filename.
const MAIN_BUNDLE_PATTERN = /^main-[A-Za-z0-9_-]+\.js$/;
const SHARED_BUNDLE_PATTERN = /^src-[A-Za-z0-9_-]+\.js$/;
const REMOTE_SELECTOR_MARKER = "process.env.CODEX_CLI_PATH";
const VERSION_ERROR_MARKER = "codex-app-server-version-unsupported:";
const REMOTE_SELECTOR_PATTERN =
  /function ([A-Za-z_$][\w$]*)\(\)\{let e=([A-Za-z_$][\w$]*)\(\);return e==null\|\|([A-Za-z_$][\w$]*)\(e\)\?null:e\}/;
const VERSION_CHECK_PATTERN =
  /function ([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\)\{return \2===([A-Za-z_$][\w$]*)\|\|([A-Za-z_$][\w$]*)\(\2,([A-Za-z_$][\w$]*)\)>=0\}/g;
const STABLE_VERSION_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:\+[0-9A-Za-z.-]+)?$/;

function isMainBundleFilename(filename) {
  return MAIN_BUNDLE_PATTERN.test(path.basename(String(filename ?? "")));
}

function isSharedBundleFilename(filename) {
  return SHARED_BUNDLE_PATTERN.test(path.basename(String(filename ?? "")));
}

function patchRemoteCliSelectorSource(source) {
  const markerIndex = source.indexOf(REMOTE_SELECTOR_MARKER);
  if (markerIndex < 0) {
    throw new Error("Codex SSH CLI selector marker was not found");
  }
  const searchEnd = Math.min(source.length, markerIndex + 2_000);
  const searchWindow = source.slice(markerIndex, searchEnd);
  const match = REMOTE_SELECTOR_PATTERN.exec(searchWindow);
  if (!match) {
    throw new Error("Codex SSH CLI selector has an unsupported structure");
  }
  const [original, selectorName, configuredCliName, pathCheckName] = match;
  const replacement =
    `function ${selectorName}(){` +
    `let e=process.env.SPINE_CODEX_REMOTE_CLI?.trim()||${configuredCliName}();` +
    `return e==null||${pathCheckName}(e)?null:e}`;
  const absoluteStart = markerIndex + match.index;
  const patched =
    source.slice(0, absoluteStart) +
    replacement +
    source.slice(absoluteStart + original.length);
  if (patched === source) {
    throw new Error("Codex SSH CLI selector was not patched");
  }
  return patched;
}

function patchMainBundleCandidateSource(filename, source) {
  if (
    !isMainBundleFilename(filename) ||
    !String(source).includes(REMOTE_SELECTOR_MARKER)
  ) {
    return null;
  }
  return patchRemoteCliSelectorSource(String(source));
}

function patchVersionCompatibilitySource(
  source,
  minimum = DEFAULT_MIN_SPINE_VERSION,
) {
  if (!parseVersion(minimum)) {
    throw new Error("SpineCodex minimum version is invalid");
  }
  const markerIndex = source.indexOf(VERSION_ERROR_MARKER);
  if (markerIndex < 0) {
    throw new Error("Codex app-server version marker was not found");
  }
  const searchStart = Math.max(0, markerIndex - 1_000);
  const searchEnd = Math.min(source.length, markerIndex + 6_000);
  const searchWindow = source.slice(searchStart, searchEnd);
  const matches = Array.from(searchWindow.matchAll(VERSION_CHECK_PATTERN));
  if (matches.length !== 1) {
    throw new Error("Codex app-server version check has an unsupported structure");
  }
  const [
    original,
    checkName,
    argumentName,
    zeroVersionName,
    compareName,
    officialMinimumName,
  ] = matches[0];
  const spineCompatible =
    `/${STABLE_VERSION_PATTERN.source}/.test(${argumentName})&&` +
    `${compareName}(${argumentName},${JSON.stringify(minimum)})>=0`;
  const replacement =
    `function ${checkName}(${argumentName}){return ` +
    `${argumentName}===${zeroVersionName}||` +
    `${compareName}(${argumentName},${officialMinimumName})>=0||` +
    `${spineCompatible}}`;
  const absoluteStart = searchStart + matches[0].index;
  const patched =
    source.slice(0, absoluteStart) +
    replacement +
    source.slice(absoluteStart + original.length);
  if (patched === source) {
    throw new Error("Codex app-server version check was not patched");
  }
  return patched;
}

function patchVersionBundleCandidateSource(
  filename,
  source,
  minimum = DEFAULT_MIN_SPINE_VERSION,
) {
  if (
    !isSharedBundleFilename(filename) ||
    !String(source).includes(VERSION_ERROR_MARKER)
  ) {
    return null;
  }
  return patchVersionCompatibilitySource(String(source), minimum);
}

function parseVersion(value) {
  const match = String(value ?? "")
    .trim()
    .match(/^v?(\d+)\.(\d+)\.(\d+)(?:\+[0-9A-Za-z.-]+)?$/);
  return match ? match.slice(1, 4).map(Number) : null;
}

function versionAtLeast(value, minimum) {
  const candidate = parseVersion(value);
  const floor = parseVersion(minimum);
  if (!candidate || !floor) return false;
  for (let index = 0; index < 3; index += 1) {
    if (candidate[index] !== floor[index]) {
      return candidate[index] > floor[index];
    }
  }
  return true;
}

function installMainProcessHook() {
  if (!process.versions?.electron || process.type !== "browser") return false;
  const minimum =
    process.env.SPINE_CODEX_MIN_VERSION || DEFAULT_MIN_SPINE_VERSION;
  if (!parseVersion(minimum)) return false;

  const originalExtension = Module._extensions[".js"];
  let patchedMainFilename = null;
  let mainPatched = false;
  let versionPatched = false;

  Module._extensions[".js"] = function spineCodexMainExtension(
    module,
    filename,
  ) {
    if (isMainBundleFilename(filename)) {
      const source = fs.readFileSync(filename, "utf8");
      const patched = patchMainBundleCandidateSource(filename, source);
      if (patched == null) {
        // This is another Vite main chunk, not the SSH-owning entrypoint. Keep
        // the hook installed until the structurally identified target loads.
        return module._compile(source, filename);
      }
      patchedMainFilename = path.resolve(filename);
      mainPatched = true;
      // Keep the extension hook for the target main bundle's direct src-* load.
      return module._compile(patched, filename);
    }

    if (
      patchedMainFilename != null &&
      path.resolve(module.parent?.filename ?? "") === patchedMainFilename &&
      isSharedBundleFilename(filename)
    ) {
      const source = fs.readFileSync(filename, "utf8");
      const patched = patchVersionBundleCandidateSource(
        filename,
        source,
        minimum,
      );
      if (patched != null) {
        Module._extensions[".js"] = originalExtension;
        versionPatched = true;
        return module._compile(patched, filename);
      }
      // The main bundle can import several src-* chunks. Compile unrelated
      // chunks unchanged and wait for the structurally identified version one.
      return module._compile(source, filename);
    }

    return Reflect.apply(originalExtension, this, [module, filename]);
  };
  process.nextTick(() => {
    if (!mainPatched || !versionPatched) {
      Module._extensions[".js"] = originalExtension;
      throw new Error(
        "SpineCodex SSH hook is incompatible with this Codex App build",
      );
    }
  });
  return true;
}

module.exports = {
  DEFAULT_MIN_SPINE_VERSION,
  parseVersion,
  versionAtLeast,
  isMainBundleFilename,
  isSharedBundleFilename,
  patchRemoteCliSelectorSource,
  patchMainBundleCandidateSource,
  patchVersionCompatibilitySource,
  patchVersionBundleCandidateSource,
  installMainProcessHook,
};

installMainProcessHook();
