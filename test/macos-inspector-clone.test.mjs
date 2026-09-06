import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  ELECTRON_FUSE_SENTINEL,
  NODE_CLI_INSPECT_FUSE_INDEX,
  createDefaultTools,
  decodeFuseState,
  describeDesktopIdentity,
  filterEntitlements,
  isCloneCurrent,
  isCloneDisabled,
  locateFuseWire,
  prepareInspectableDesktopClone,
  readFuseState,
  resolveCloneRoot,
  serializeEntitlementsPlist,
  writeFuseState,
} from "../lib/macos-inspector-clone.mjs";

const DARWIN = process.platform === "darwin";
const DEFAULT_FUSES = [0x30, 0x31, 0x30, 0x30, 0x31, 0x31, 0x30, 0x30, 0x31];

function fuseWire(states) {
  return Buffer.concat([
    ELECTRON_FUSE_SENTINEL,
    Buffer.from([1, states.length]),
    Buffer.from(states),
  ]);
}

test("decodes the Electron fuse wire states", () => {
  assert.equal(decodeFuseState(0x30), "off");
  assert.equal(decodeFuseState(0x31), "on");
  assert.equal(decodeFuseState(0x72), "removed");
  assert.equal(decodeFuseState(0x90), "inherit");
  assert.equal(decodeFuseState(0x41), "unknown");
});

test("locates a fuse wire across the scan chunk boundary and flips one fuse", async () => {
  const directory = await mkdtemp(join(tmpdir(), "spine-fuse-"));
  try {
    const binary = join(directory, "Fake Framework");
    const prefix = Buffer.alloc(1024 * 1024 - 10, 0x41);
    const wire = fuseWire(DEFAULT_FUSES);
    const suffix = Buffer.alloc(4096, 0x42);
    await writeFile(binary, Buffer.concat([prefix, wire, suffix]));

    const located = await locateFuseWire(binary);
    assert.equal(located.offset, prefix.length);
    assert.equal(located.schema, 1);
    assert.equal(located.count, 9);
    assert.equal(await readFuseState(binary, NODE_CLI_INSPECT_FUSE_INDEX), "off");
    assert.equal(await readFuseState(binary, 2), "off");
    assert.equal(await readFuseState(binary, 20), "unsupported");

    const result = await writeFuseState(binary, NODE_CLI_INSPECT_FUSE_INDEX, "on");
    assert.deepEqual(result, { previous: "off", current: "on" });
    const after = await readFile(binary);
    assert.equal(after.length, prefix.length + wire.length + suffix.length);
    assert.equal(after.subarray(0, prefix.length).equals(prefix), true);
    assert.equal(after.subarray(prefix.length + wire.length).equals(suffix), true);
    assert.equal(await readFuseState(binary, NODE_CLI_INSPECT_FUSE_INDEX), "on");
    assert.equal(await readFuseState(binary, 2), "off");

    const plain = join(directory, "plain");
    await writeFile(plain, Buffer.alloc(64, 0x43));
    assert.equal(await readFuseState(plain, 0), "not-found");
    await assert.rejects(writeFuseState(plain, 3, "on"), /no Electron fuse wire/);
    await assert.rejects(writeFuseState(binary, 3, "sideways"), /unsupported Electron fuse state/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("leaves provisioning-only entitlements out and disables library validation", () => {
  const { filtered, removed } = filterEntitlements({
    "com.apple.application-identifier": "TEAM.com.example",
    "com.apple.developer.team-identifier": "TEAM",
    "com.apple.developer.aps-environment": "production",
    "keychain-access-groups": ["TEAM.*"],
    "com.apple.security.application-groups": ["TEAM.group"],
    "com.apple.security.cs.allow-jit": true,
    "com.apple.security.app-sandbox": false,
    "com.apple.security.network.client": true,
  });
  assert.deepEqual(removed, [
    "com.apple.application-identifier",
    "com.apple.developer.team-identifier",
    "com.apple.developer.aps-environment",
    "keychain-access-groups",
    "com.apple.security.application-groups",
  ]);
  assert.deepEqual(filtered, {
    "com.apple.security.cs.allow-jit": true,
    "com.apple.security.app-sandbox": false,
    "com.apple.security.network.client": true,
    "com.apple.security.cs.disable-library-validation": true,
  });
});

test("serializes entitlements as a property list", { skip: !DARWIN }, () => {
  const plist = serializeEntitlementsPlist({
    "com.apple.security.cs.allow-jit": true,
    "com.apple.security.app-sandbox": false,
    "a&b": "x<y",
    list: ["one", "two"],
  });
  const result = spawnSync(
    "/usr/bin/plutil",
    ["-convert", "json", "-o", "-", "-"],
    { input: plist, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    "com.apple.security.cs.allow-jit": true,
    "com.apple.security.app-sandbox": false,
    "a&b": "x<y",
    list: ["one", "two"],
  });
});

test("default tools read scalar and container Info.plist values", { skip: !DARWIN }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "spine plist "));
  try {
    const plist = join(directory, "Info.plist");
    await writeFile(plist, [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0"><dict>',
      "<key>CFBundleShortVersionString</key><string>26.901.51231</string>",
      "<key>CFBundleVersion</key><string>8109</string>",
      "<key>ElectronAsarIntegrity</key><dict><key>Resources/app.asar</key><dict>",
      "<key>algorithm</key><string>SHA256</string><key>hash</key><string>abc</string>",
      "</dict></dict>",
      "</dict></plist>",
      "",
    ].join("\n"), "utf8");
    const tools = createDefaultTools();
    assert.equal(await tools.readPlistValue(plist, "CFBundleShortVersionString"), "26.901.51231");
    assert.equal(await tools.readPlistValue(plist, "CFBundleVersion"), "8109");
    assert.deepEqual(await tools.readPlistValue(plist, "ElectronAsarIntegrity"), {
      "Resources/app.asar": { algorithm: "SHA256", hash: "abc" },
    });
    assert.equal(await tools.readPlistValue(plist, "Missing"), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("clone environment switches are explicit", () => {
  assert.equal(isCloneDisabled({}), false);
  assert.equal(isCloneDisabled({ SPINE_CODEX_DISABLE_DESKTOP_CLONE: "1" }), true);
  assert.equal(isCloneDisabled({ SPINE_CODEX_DISABLE_DESKTOP_CLONE: "true" }), true);
  assert.equal(isCloneDisabled({ SPINE_CODEX_DISABLE_DESKTOP_CLONE: "0" }), false);
  assert.equal(resolveCloneRoot({ SPINE_CODEX_DESKTOP_CLONE_ROOT: "/tmp/x" }), "/tmp/x");
  assert.equal(resolveCloneRoot({ SPINE_CODEX_DESKTOP_CLONE_ROOT: "  " }), resolveCloneRoot({}));
  assert.match(resolveCloneRoot({}), /SpineCodex App\/inspectable-desktop$/);
});

test("manifest currency requires the same schema, fuse, and Desktop identity", () => {
  const identity = { desktopVersion: "26.901.51231", frameworkSize: 10 };
  const manifest = {
    schemaVersion: 1,
    fuseIndex: 3,
    identity: { frameworkSize: 10, desktopVersion: "26.901.51231" },
  };
  assert.equal(isCloneCurrent(manifest, identity), true);
  assert.equal(isCloneCurrent({ ...manifest, fuseIndex: 2 }, identity), false);
  assert.equal(isCloneCurrent({ ...manifest, schemaVersion: 2 }, identity), false);
  assert.equal(isCloneCurrent(manifest, { ...identity, frameworkSize: 11 }), false);
  assert.equal(isCloneCurrent(null, identity), false);
});

test("prepares, reuses, and rebuilds an inspectable clone without touching the source", async () => {
  const directory = await mkdtemp(join(tmpdir(), "spine clone "));
  try {
    const appPath = join(directory, "Fake.app");
    await writeFakeDesktop(appPath, DEFAULT_FUSES);
    const sourceBinary = join(
      appPath,
      "Contents/Frameworks/Fake Framework.framework/Fake Framework",
    );
    const cloneRoot = join(directory, "clones");
    const calls = [];
    const tools = fakeTools(calls);
    let tick = 0;
    const now = () => new Date(1_756_000_000_000 + tick++);

    const identity = await describeDesktopIdentity(appPath, tools);
    assert.equal(identity.desktopVersion, "26.901.51231");
    assert.equal(identity.executableName, "Fake");
    assert.equal(
      identity.frameworkBinary,
      "Contents/Frameworks/Fake Framework.framework/Fake Framework",
    );
    assert.match(identity.asarIntegrity, /"hash":"abc"/);

    const first = await prepareInspectableDesktopClone({ appPath, cloneRoot, tools, now });
    assert.equal(first.reused, false);
    assert.equal(first.appPath, join(cloneRoot, "Fake.app"));
    const cloneBinary = join(first.appPath, identity.frameworkBinary);
    assert.equal(await readFuseState(cloneBinary, NODE_CLI_INSPECT_FUSE_INDEX), "on");
    assert.equal(await readFuseState(cloneBinary, 2), "off");
    assert.equal(await readFuseState(sourceBinary, NODE_CLI_INSPECT_FUSE_INDEX), "off");
    assert.equal(first.manifest.copyMode, "fake-copy");
    assert.equal(first.manifest.previousFuseState, "off");
    assert.equal(first.manifest.fuseName, "nodeCliInspect");
    assert.deepEqual(first.manifest.signing.strippedEntitlementKeys, [
      "com.apple.application-identifier",
      "com.apple.developer.team-identifier",
      "keychain-access-groups",
    ]);
    assert.deepEqual(first.manifest.signing.signedTargets, [
      "Contents/Frameworks/Fake Framework.framework/Versions/A/Helpers/Fake (Renderer).app",
      "Contents/Frameworks/Fake Framework.framework/Versions/A/Helpers/loader",
      "Contents/Frameworks/Fake Framework.framework/Versions/A",
      "Contents/Frameworks/Other.framework",
      "Contents/PlugIns/Dock.docktileplugin",
      ".",
    ]);
    const deepSigned = calls
      .filter(([kind, , options]) => kind === "sign" && options.deep)
      .map(([, target]) => target);
    assert.deepEqual(deepSigned, [
      join(first.appPath, "Contents/Frameworks/Other.framework"),
      join(first.appPath, "Contents/PlugIns/Dock.docktileplugin"),
    ]);
    assert.deepEqual(
      calls.filter(([kind]) => kind === "verify").map(([, target]) => target),
      [first.appPath],
    );
    const manifestOnDisk = JSON.parse(
      await readFile(join(cloneRoot, "inspectable-clone.json"), "utf8"),
    );
    assert.equal(manifestOnDisk.createdAt, first.manifest.createdAt);

    calls.length = 0;
    const second = await prepareInspectableDesktopClone({ appPath, cloneRoot, tools, now });
    assert.equal(second.reused, true);
    assert.equal(second.manifest.createdAt, first.manifest.createdAt);
    assert.deepEqual(calls.filter(([kind]) => kind !== "plist"), []);

    // A Desktop update changes the framework binary; the clone is rebuilt.
    await writeFile(
      sourceBinary,
      Buffer.concat([Buffer.alloc(32, 0x44), fuseWire(DEFAULT_FUSES), Buffer.alloc(8, 0x45)]),
    );
    calls.length = 0;
    const third = await prepareInspectableDesktopClone({ appPath, cloneRoot, tools, now });
    assert.equal(third.reused, false);
    assert.notEqual(third.manifest.createdAt, first.manifest.createdAt);
    assert.equal(calls.filter(([kind]) => kind === "clone").length, 1);
    assert.equal(await readFuseState(cloneBinary, NODE_CLI_INSPECT_FUSE_INDEX), "on");
    assert.equal(await readFuseState(sourceBinary, NODE_CLI_INSPECT_FUSE_INDEX), "off");

    // A clone that lost its re-enabled fuse is not reused either.
    await writeFuseState(cloneBinary, NODE_CLI_INSPECT_FUSE_INDEX, "off");
    calls.length = 0;
    const fourth = await prepareInspectableDesktopClone({ appPath, cloneRoot, tools, now });
    assert.equal(fourth.reused, false);
    assert.equal(calls.filter(([kind]) => kind === "clone").length, 1);
    assert.equal(await readFuseState(cloneBinary, NODE_CLI_INSPECT_FUSE_INDEX), "on");
    assert.equal(await readFuseState(sourceBinary, NODE_CLI_INSPECT_FUSE_INDEX), "off");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function writeFakeDesktop(appPath, fuses) {
  const contents = join(appPath, "Contents");
  const framework = join(contents, "Frameworks", "Fake Framework.framework");
  const versionA = join(framework, "Versions", "A");
  const helpers = join(versionA, "Helpers");
  await mkdir(join(contents, "MacOS"), { recursive: true });
  await mkdir(join(contents, "Resources"), { recursive: true });
  await mkdir(helpers, { recursive: true });
  await mkdir(join(helpers, "Fake (Renderer).app", "Contents", "MacOS"), { recursive: true });
  await mkdir(join(contents, "Frameworks", "Other.framework", "Versions", "A"), { recursive: true });
  await mkdir(join(contents, "PlugIns", "Dock.docktileplugin", "Contents", "MacOS"), {
    recursive: true,
  });

  await writeFile(join(contents, "Info.plist"), "<plist/>\n", "utf8");
  await writeFile(join(contents, "Info.json"), JSON.stringify({
    CFBundleShortVersionString: "26.901.51231",
    CFBundleVersion: "8109",
    CFBundleExecutable: "Fake",
    ElectronAsarIntegrity: { "Resources/app.asar": { hash: "abc", algorithm: "SHA256" } },
  }), "utf8");
  await writeFile(join(contents, "MacOS", "Fake"), "#!/bin/sh\nexit 0\n", "utf8");
  await chmod(join(contents, "MacOS", "Fake"), 0o755);
  await writeFile(join(contents, "Resources", "app.asar"), Buffer.alloc(16, 0x00));
  await writeFile(
    join(versionA, "Fake Framework"),
    Buffer.concat([Buffer.alloc(64, 0x41), fuseWire(fuses), Buffer.alloc(16, 0x42)]),
  );
  await symlink("A", join(framework, "Versions", "Current"));
  await symlink("Versions/Current/Fake Framework", join(framework, "Fake Framework"));
  await writeFile(join(helpers, "Fake (Renderer).app", "Contents", "MacOS", "x"), "", "utf8");
  await writeFile(join(helpers, "loader"), "#!/bin/sh\n", "utf8");
  await chmod(join(helpers, "loader"), 0o755);
  await writeFile(join(helpers, "notes.txt"), "not code\n", "utf8");
  await writeFile(
    join(contents, "Frameworks", "Other.framework", "Versions", "A", "Other"),
    Buffer.alloc(8, 0x46),
  );
  await symlink("A", join(contents, "Frameworks", "Other.framework", "Versions", "Current"));
  await writeFile(
    join(contents, "PlugIns", "Dock.docktileplugin", "Contents", "MacOS", "x"),
    "",
    "utf8",
  );
}

function fakeTools(calls) {
  return {
    async readPlistValue(path, key) {
      calls.push(["plist", path, key]);
      const info = JSON.parse(await readFile(join(dirname(path), "Info.json"), "utf8"));
      return info[key] ?? null;
    },
    async cloneBundle(source, destination) {
      calls.push(["clone", source, destination]);
      await cp(source, destination, { recursive: true, verbatimSymlinks: true });
      return "fake-copy";
    },
    async readEntitlements(target) {
      calls.push(["entitlements", target]);
      if (!target.endsWith(".app")) return null;
      return {
        "com.apple.application-identifier": "TEAM.fake",
        "com.apple.developer.team-identifier": "TEAM",
        "keychain-access-groups": ["TEAM.*"],
        "com.apple.security.cs.allow-jit": true,
      };
    },
    async sign(target, options = {}) {
      calls.push(["sign", target, options]);
      if (options.entitlementsPath) {
        const plist = await readFile(options.entitlementsPath, "utf8");
        assert.match(plist, /disable-library-validation/);
        assert.match(plist, /allow-jit/);
        assert.doesNotMatch(plist, /application-identifier|keychain-access-groups/);
      }
    },
    async verifyBundle(appPath) {
      calls.push(["verify", appPath]);
    },
  };
}
