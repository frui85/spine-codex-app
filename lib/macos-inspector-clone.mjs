import {
  access,
  mkdir,
  open as openFile,
  readdir,
  readFile,
  readlink,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { basename, isAbsolute, join, relative } from "node:path";

// Current macOS Codex Desktop builds ship with the Electron `nodeCliInspect`
// fuse disabled, which turns off `--inspect*` and the SIGUSR1 Inspector
// trigger in the signed bundle. The launcher therefore prepares a private,
// APFS-cloned copy of the Desktop bundle, re-enables only that fuse in the
// copy, and re-signs the copy ad hoc. The original bundle is never modified.
export const ELECTRON_FUSE_SENTINEL = Buffer.from(
  "dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX",
  "latin1",
);
export const NODE_CLI_INSPECT_FUSE_INDEX = 3;
export const CLONE_DISABLE_ENV = "SPINE_CODEX_DISABLE_DESKTOP_CLONE";
export const CLONE_ROOT_ENV = "SPINE_CODEX_DESKTOP_CLONE_ROOT";
export const MANIFEST_NAME = "inspectable-clone.json";
export const MANIFEST_SCHEMA_VERSION = 1;
export const LIBRARY_VALIDATION_ENTITLEMENT =
  "com.apple.security.cs.disable-library-validation";
// Entitlements that only a provisioning profile from the original developer
// can authorize. They are meaningless on an ad-hoc signature and prevent the
// copy from starting, so they are left out of the copy.
export const RESTRICTED_ENTITLEMENT_KEYS = Object.freeze([
  "com.apple.application-identifier",
  "keychain-access-groups",
  "com.apple.security.application-groups",
]);
export const RESTRICTED_ENTITLEMENT_PREFIX = "com.apple.developer.";

const FUSE_STATE_BYTES = new Map([
  ["off", 0x30],
  ["on", 0x31],
  ["removed", 0x72],
  ["inherit", 0x90],
]);
const FUSE_BYTE_STATES = new Map(
  [...FUSE_STATE_BYTES].map(([state, byte]) => [byte, state]),
);
const CHUNK_SIZE = 1024 * 1024;
const FUSE_WIRE_MAX_COUNT = 255;

export function defaultCloneRoot() {
  return join(
    homedir(),
    "Library",
    "Application Support",
    "SpineCodex App",
    "inspectable-desktop",
  );
}

export function resolveCloneRoot(env = process.env) {
  const configured = env[CLONE_ROOT_ENV]?.trim();
  return configured ? configured : defaultCloneRoot();
}

export function isCloneDisabled(env = process.env) {
  const value = env[CLONE_DISABLE_ENV]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function decodeFuseState(byte) {
  return FUSE_BYTE_STATES.get(byte) ?? "unknown";
}

export async function locateFuseWire(binaryPath) {
  const handle = await openFile(binaryPath, "r");
  const overlapSize = ELECTRON_FUSE_SENTINEL.length + 2 + FUSE_WIRE_MAX_COUNT;
  let overlap = Buffer.alloc(0);
  let overlapStart = 0;
  let position = 0;
  try {
    while (true) {
      const chunk = Buffer.allocUnsafe(CHUNK_SIZE);
      const { bytesRead } = await handle.read(chunk, 0, CHUNK_SIZE, position);
      if (bytesRead === 0) break;
      position += bytesRead;
      const windowStart = overlapStart;
      const window = Buffer.concat([overlap, chunk.subarray(0, bytesRead)]);
      const sentinelIndex = window.indexOf(ELECTRON_FUSE_SENTINEL);
      if (sentinelIndex >= 0) {
        const header = sentinelIndex + ELECTRON_FUSE_SENTINEL.length;
        if (window.length >= header + 2) {
          const schema = window[header];
          const count = window[header + 1];
          if (window.length >= header + 2 + count) {
            return {
              offset: windowStart + sentinelIndex,
              schema,
              count,
              values: Buffer.from(window.subarray(header + 2, header + 2 + count)),
            };
          }
        }
        overlap = Buffer.from(window.subarray(sentinelIndex));
        overlapStart = windowStart + sentinelIndex;
        continue;
      }
      const keep = Math.min(window.length, overlapSize);
      overlap = Buffer.from(window.subarray(window.length - keep));
      overlapStart = windowStart + window.length - keep;
    }
  } finally {
    await handle.close();
  }
  return null;
}

export async function readFuseState(binaryPath, fuseIndex) {
  const wire = await locateFuseWire(binaryPath);
  if (!wire) return "not-found";
  if (wire.schema !== 1 || wire.count <= fuseIndex) return "unsupported";
  return decodeFuseState(wire.values[fuseIndex]);
}

export async function writeFuseState(binaryPath, fuseIndex, state = "on") {
  const byte = FUSE_STATE_BYTES.get(state);
  if (byte == null) throw new Error(`unsupported Electron fuse state: ${state}`);
  const wire = await locateFuseWire(binaryPath);
  if (!wire) throw new Error(`${binaryPath} has no Electron fuse wire`);
  if (wire.schema !== 1 || wire.count <= fuseIndex) {
    throw new Error(
      `${binaryPath} has an unsupported Electron fuse wire ` +
        `(schema ${wire.schema}, ${wire.count} fuses)`,
    );
  }
  const position = wire.offset + ELECTRON_FUSE_SENTINEL.length + 2 + fuseIndex;
  const handle = await openFile(binaryPath, "r+");
  try {
    await handle.write(Buffer.from([byte]), 0, 1, position);
  } finally {
    await handle.close();
  }
  const verified = await readFuseState(binaryPath, fuseIndex);
  if (verified !== state) {
    throw new Error(`Electron fuse ${fuseIndex} reads ${verified} after writing ${state}`);
  }
  return { previous: decodeFuseState(wire.values[fuseIndex]), current: verified };
}

export async function resolveFrameworkBinary(appPath) {
  const frameworksPath = join(appPath, "Contents", "Frameworks");
  const entries = await readdir(frameworksPath, { withFileTypes: true });
  const frameworkBundle = entries.find(
    (entry) => entry.isDirectory() && / Framework\.framework$/.test(entry.name),
  )?.name;
  if (!frameworkBundle) {
    throw new Error(`${appPath} has no Electron framework bundle`);
  }
  const frameworkName = frameworkBundle.slice(0, -".framework".length);
  return join(frameworksPath, frameworkBundle, frameworkName);
}

export function isRestrictedEntitlement(key) {
  return (
    RESTRICTED_ENTITLEMENT_KEYS.includes(key) ||
    key.startsWith(RESTRICTED_ENTITLEMENT_PREFIX)
  );
}

export function filterEntitlements(entitlements) {
  const filtered = {};
  const removed = [];
  for (const [key, value] of Object.entries(entitlements ?? {})) {
    if (isRestrictedEntitlement(key)) {
      removed.push(key);
    } else {
      filtered[key] = value;
    }
  }
  filtered[LIBRARY_VALIDATION_ENTITLEMENT] = true;
  return { filtered, removed };
}

export function serializeEntitlementsPlist(entitlements) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
  ];
  for (const key of Object.keys(entitlements).sort()) {
    lines.push(`\t<key>${escapeXml(key)}</key>`);
    lines.push(`\t${serializePlistValue(entitlements[key])}`);
  }
  lines.push("</dict>", "</plist>", "");
  return lines.join("\n");
}

function serializePlistValue(value) {
  if (typeof value === "boolean") return value ? "<true/>" : "<false/>";
  if (typeof value === "string") return `<string>${escapeXml(value)}</string>`;
  if (Number.isInteger(value)) return `<integer>${value}</integer>`;
  if (typeof value === "number" && Number.isFinite(value)) return `<real>${value}</real>`;
  if (Array.isArray(value)) {
    return `<array>${value.map(serializePlistValue).join("")}</array>`;
  }
  if (value && typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `<key>${escapeXml(key)}</key>${serializePlistValue(value[key])}`);
    return `<dict>${entries.join("")}</dict>`;
  }
  throw new Error(`unsupported entitlement value: ${String(value)}`);
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function describeDesktopIdentity(appPath, tools = createDefaultTools()) {
  const infoPlist = join(appPath, "Contents", "Info.plist");
  const desktopVersion = await tools.readPlistValue(infoPlist, "CFBundleShortVersionString");
  const bundleVersion = await tools.readPlistValue(infoPlist, "CFBundleVersion");
  const executableName =
    (await tools.readPlistValue(infoPlist, "CFBundleExecutable")) ?? basename(appPath, ".app");
  const asarIntegrity = await tools.readPlistValue(infoPlist, "ElectronAsarIntegrity");
  const frameworkBinary = await resolveFrameworkBinary(appPath);
  const frameworkStat = await stat(frameworkBinary);
  const executable = join(appPath, "Contents", "MacOS", String(executableName));
  const executableStat = await stat(executable);
  return {
    sourceAppPath: appPath,
    desktopVersion: desktopVersion == null ? null : String(desktopVersion),
    bundleVersion: bundleVersion == null ? null : String(bundleVersion),
    executableName: String(executableName),
    executableSize: executableStat.size,
    asarIntegrity: asarIntegrity == null ? null : stableStringify(asarIntegrity),
    frameworkBinary: relative(appPath, frameworkBinary),
    frameworkSize: frameworkStat.size,
    frameworkMtimeMs: Math.floor(frameworkStat.mtimeMs),
  };
}

export function isCloneCurrent(manifest, identity, fuseIndex = NODE_CLI_INSPECT_FUSE_INDEX) {
  return (
    manifest?.schemaVersion === MANIFEST_SCHEMA_VERSION &&
    manifest.fuseIndex === fuseIndex &&
    manifest.identity != null &&
    stableStringify(manifest.identity) === stableStringify(identity)
  );
}

export async function prepareInspectableDesktopClone({
  appPath,
  cloneRoot = resolveCloneRoot(),
  fuseIndex = NODE_CLI_INSPECT_FUSE_INDEX,
  tools = createDefaultTools(),
  log = () => {},
  now = () => new Date(),
}) {
  if (!appPath) throw new Error("Codex Desktop path is required");
  const identity = await describeDesktopIdentity(appPath, tools);
  const clonePath = join(cloneRoot, basename(appPath));
  const manifestPath = join(cloneRoot, MANIFEST_NAME);
  const existing = await readManifest(manifestPath);
  if (
    existing &&
    isCloneCurrent(existing, identity, fuseIndex) &&
    await isCloneInspectable(clonePath, identity, fuseIndex)
  ) {
    return { appPath: clonePath, reused: true, manifest: existing };
  }

  await rm(manifestPath, { force: true });
  await rm(clonePath, { recursive: true, force: true });
  await mkdir(cloneRoot, { recursive: true });
  log("cloning");
  const copyMode = await tools.cloneBundle(appPath, clonePath);
  const cloneBinary = join(clonePath, identity.frameworkBinary);
  const fuse = await writeFuseState(cloneBinary, fuseIndex, "on");
  log("signing");
  const signing = await resignBundle(clonePath, tools);
  await tools.verifyBundle(clonePath);
  const manifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    createdAt: now().toISOString(),
    sourceAppPath: appPath,
    clonePath,
    copyMode,
    fuseIndex,
    fuseName: "nodeCliInspect",
    previousFuseState: fuse.previous,
    identity,
    signing,
  };
  await writeJsonAtomic(manifestPath, manifest);
  return { appPath: clonePath, reused: false, manifest };
}

async function isCloneInspectable(clonePath, identity, fuseIndex) {
  try {
    await access(
      join(clonePath, "Contents", "MacOS", identity.executableName),
      constants.X_OK,
    );
    const state = await readFuseState(join(clonePath, identity.frameworkBinary), fuseIndex);
    return state === "on";
  } catch {
    return false;
  }
}

async function resignBundle(appPath, tools) {
  const signedTargets = [];
  const strippedEntitlementKeys = new Set();
  const signPlain = async (target, options = {}) => {
    await tools.sign(target, options);
    signedTargets.push(relative(appPath, target) || ".");
  };
  const signWithEntitlements = async (target) => {
    const entitlements = await tools.readEntitlements(target);
    let entitlementsPath = null;
    if (entitlements && Object.keys(entitlements).length > 0) {
      const { filtered, removed } = filterEntitlements(entitlements);
      for (const key of removed) strippedEntitlementKeys.add(key);
      entitlementsPath = join(
        tmpdir(),
        `spine-codex-entitlements-${process.pid}-${signedTargets.length}.plist`,
      );
      await writeFile(entitlementsPath, serializeEntitlementsPlist(filtered), "utf8");
    }
    try {
      await signPlain(target, { entitlementsPath });
    } finally {
      if (entitlementsPath) await rm(entitlementsPath, { force: true });
    }
  };

  // Nested code is signed inside out. Bare helper executables are not covered
  // by a deep signature of their framework, so they are signed explicitly
  // before the framework version directory that seals them.
  const frameworksDir = join(appPath, "Contents", "Frameworks");
  for (const name of await listDirectory(frameworksDir)) {
    if (!name.endsWith(".framework")) continue;
    const framework = join(frameworksDir, name);
    const versionDir = await resolveFrameworkVersionDirectory(framework);
    const helpers = join(versionDir, "Helpers");
    if (!(await exists(helpers))) {
      await signPlain(framework, { deep: true });
      continue;
    }
    for (const helper of await listDirectory(helpers)) {
      const target = join(helpers, helper);
      if (helper.endsWith(".app")) {
        await signWithEntitlements(target);
      } else if (await isExecutableFile(target)) {
        await signPlain(target);
      }
    }
    await signPlain(versionDir);
  }
  const pluginsDir = join(appPath, "Contents", "PlugIns");
  for (const plugin of await listDirectory(pluginsDir)) {
    await signPlain(join(pluginsDir, plugin), { deep: true });
  }
  await signWithEntitlements(appPath);
  return {
    identity: "ad-hoc",
    hardenedRuntime: true,
    signedTargets,
    strippedEntitlementKeys: [...strippedEntitlementKeys].sort(),
  };
}

async function resolveFrameworkVersionDirectory(framework) {
  const current = join(framework, "Versions", "Current");
  try {
    const target = await readlink(current);
    return isAbsolute(target) ? target : join(framework, "Versions", target);
  } catch (error) {
    if (error?.code === "EINVAL") return current;
    return framework;
  }
}

export function createDefaultTools() {
  return {
    async readPlistValue(path, key) {
      const json = await run("/usr/bin/plutil", ["-extract", key, "json", "-o", "-", path]);
      if (json.status === 0) {
        try {
          return JSON.parse(json.stdout);
        } catch {
          return null;
        }
      }
      // plutil serializes only containers as JSON; scalar values such as
      // CFBundleShortVersionString are read through the raw formatter.
      const raw = await run("/usr/bin/plutil", ["-extract", key, "raw", "-o", "-", path]);
      if (raw.status !== 0) return null;
      return raw.stdout.replace(/\n$/, "");
    },
    async cloneBundle(source, destination) {
      const clone = await run("/bin/cp", ["-c", "-R", source, destination]);
      if (clone.status === 0) return "clonefile";
      await rm(destination, { recursive: true, force: true });
      const copy = await run("/bin/cp", ["-R", source, destination]);
      if (copy.status !== 0) {
        throw new Error(
          `could not copy ${source}: ${copy.stderr.trim() || `cp exited ${copy.status}`}`,
        );
      }
      return "copy";
    },
    async readEntitlements(target) {
      const dump = await run("/usr/bin/codesign", ["-d", "--entitlements", ":-", target]);
      if (dump.status !== 0 || !dump.stdout.trim()) return null;
      const json = await run(
        "/usr/bin/plutil",
        ["-convert", "json", "-o", "-", "-"],
        { input: dump.stdout },
      );
      if (json.status !== 0) {
        throw new Error(`could not parse entitlements of ${target}: ${json.stderr.trim()}`);
      }
      return JSON.parse(json.stdout);
    },
    async sign(target, { deep = false, entitlementsPath = null } = {}) {
      const result = await run("/usr/bin/codesign", [
        "--force",
        "--options",
        "runtime",
        ...(deep ? ["--deep"] : []),
        ...(entitlementsPath ? ["--entitlements", entitlementsPath] : []),
        "--sign",
        "-",
        target,
      ]);
      if (result.status !== 0) {
        throw new Error(`codesign failed for ${target}: ${result.stderr.trim()}`);
      }
    },
    async verifyBundle(appPath) {
      const result = await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", appPath]);
      if (result.status !== 0) {
        throw new Error(`clone signature verification failed: ${result.stderr.trim()}`);
      }
    },
  };
}

export function run(command, args, { input = null } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (status) => {
      resolve({
        status,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
    child.stdin.end(input ?? undefined);
  });
}

async function readManifest(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function writeJsonAtomic(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

async function listDirectory(path) {
  try {
    return (await readdir(path)).sort();
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function isExecutableFile(path) {
  try {
    const info = await stat(path);
    if (!info.isFile()) return false;
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
