"use strict";

const Module = require("node:module");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_MIN_SPINE_VERSION = "0.2.1";
const MAIN_BUNDLE_PATTERN = /^main--[A-Za-z0-9_-]+\.js$/;
const SHARED_BUNDLE_REQUEST_PATTERN = /^\.\/src-[A-Za-z0-9_-]+\.js$/;
const REMOTE_SELECTOR_PATTERN =
  /function ([A-Za-z_$][\w$]*)\(\)\{let e=([A-Za-z_$][\w$]*)\(\);return e==null\|\|([A-Za-z_$][\w$]*)\(e\)\?null:e\}/;

function patchRemoteCliSelectorSource(source) {
  const marker = "process.env.CODEX_CLI_PATH";
  const markerIndex = source.indexOf(marker);
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

function isCodexVersionModule(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.wc === "function" &&
      typeof value.Cc === "function" &&
      typeof value.Sc === "string",
  );
}

function wrapCodexVersionModule(value, minimum = DEFAULT_MIN_SPINE_VERSION) {
  if (!isCodexVersionModule(value)) return value;
  const originalCheck = value.wc;
  const compatible = (candidate) =>
    Reflect.apply(originalCheck, value, [candidate]) ||
    versionAtLeast(candidate, minimum);
  const facade = Object.create(Object.getPrototypeOf(value));
  return new Proxy(facade, {
    get(_target, property, receiver) {
      if (property === "wc") return compatible;
      return Reflect.get(value, property, receiver);
    },
    has(_target, property) {
      return Reflect.has(value, property);
    },
    ownKeys() {
      return Reflect.ownKeys(value);
    },
    getOwnPropertyDescriptor(_target, property) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, property);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
    set(_target, property, nextValue, receiver) {
      return Reflect.set(value, property, nextValue, receiver);
    },
  });
}

function installMainProcessHook() {
  if (!process.versions?.electron || process.type !== "browser") return false;
  const minimum =
    process.env.SPINE_CODEX_MIN_VERSION || DEFAULT_MIN_SPINE_VERSION;
  if (!parseVersion(minimum)) return false;

  const originalExtension = Module._extensions[".js"];
  const originalLoad = Module._load;
  const proxyCache = new WeakMap();
  let mainPatched = false;
  let versionWrapped = false;

  Module._extensions[".js"] = function spineCodexMainExtension(
    module,
    filename,
  ) {
    if (!MAIN_BUNDLE_PATTERN.test(path.basename(filename))) {
      return Reflect.apply(originalExtension, this, [module, filename]);
    }
    Module._extensions[".js"] = originalExtension;
    const source = fs.readFileSync(filename, "utf8");
    const patched = patchRemoteCliSelectorSource(source);
    mainPatched = true;
    return module._compile(patched, filename);
  };

  Module._load = function spineCodexModuleLoad(request, parent, isMain) {
    const loaded = Reflect.apply(originalLoad, this, [request, parent, isMain]);
    const parentName = path.basename(parent?.filename ?? "");
    if (
      !MAIN_BUNDLE_PATTERN.test(parentName) ||
      !SHARED_BUNDLE_REQUEST_PATTERN.test(String(request)) ||
      !isCodexVersionModule(loaded)
    ) {
      return loaded;
    }
    let proxy = proxyCache.get(loaded);
    if (!proxy) {
      proxy = wrapCodexVersionModule(loaded, minimum);
      proxyCache.set(loaded, proxy);
    }
    versionWrapped = true;
    // The main bundle now owns the wrapped checker in its local binding.
    // Restore Node's loader immediately; there is no lifetime-wide require hook.
    Module._load = originalLoad;
    return proxy;
  };
  process.nextTick(() => {
    if (!mainPatched || !versionWrapped) {
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
  patchRemoteCliSelectorSource,
  isCodexVersionModule,
  wrapCodexVersionModule,
  installMainProcessHook,
};

installMainProcessHook();
