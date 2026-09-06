#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  cp,
  mkdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const metadata = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
const VERSION = valueAfter("--version") ?? metadata.spineAppVersion ?? metadata.version;
const SOURCE_VERSION = metadata.spineAppVersion ?? metadata.version;
if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(VERSION)) {
  throw new Error(`invalid release version: ${VERSION}`);
}
if (VERSION !== SOURCE_VERSION) {
  throw new Error(`release version ${VERSION} does not match source ${SOURCE_VERSION}`);
}
const NODE_VERSION = "v22.23.2";
const BUNDLE_NAME = "SpineCodex App";
const BUNDLE_ID = "io.github.izumedonabe.spine-codex-app";
const args = new Set(process.argv.slice(2));
const architectures = args.has("--all")
  ? ["arm64", "x64"]
  : [valueAfter("--arch") ?? process.arch];

for (const architecture of architectures) {
  if (!["arm64", "x64"].includes(architecture)) {
    throw new Error(`unsupported architecture: ${architecture}`);
  }
  await build(architecture);
}

async function build(architecture) {
  const buildRoot = join(ROOT, ".build", `macos-${architecture}`);
  const downloads = join(ROOT, ".build", "downloads");
  const dist = join(ROOT, "dist");
  const app = join(buildRoot, `${BUNDLE_NAME}.app`);
  const contents = join(app, "Contents");
  const macos = join(contents, "MacOS");
  const resources = join(contents, "Resources");
  const wrapper = join(resources, "wrapper");
  const runtime = join(resources, "runtime");
  const licenses = join(resources, "licenses");
  const stage = join(buildRoot, "dmg");
  const nodePlatform = architecture === "arm64" ? "arm64" : "x64";
  const nodeDirectory = `node-${NODE_VERSION}-darwin-${nodePlatform}`;
  const nodeArchiveName = `${nodeDirectory}.tar.gz`;
  const nodeArchive = join(downloads, nodeArchiveName);
  const shasums = join(downloads, `SHASUMS256-${NODE_VERSION}.txt`);
  const dmgName = `SpineCodex-App-v${VERSION}-macos-${architecture}.dmg`;
  const dmg = join(dist, dmgName);

  await rm(buildRoot, { recursive: true, force: true });
  await mkdir(downloads, { recursive: true });
  await mkdir(dist, { recursive: true });
  await mkdir(macos, { recursive: true });
  await mkdir(wrapper, { recursive: true });
  await mkdir(join(wrapper, "lib"), { recursive: true });
  await mkdir(runtime, { recursive: true });
  await mkdir(licenses, { recursive: true });

  await download(
    `https://nodejs.org/dist/${NODE_VERSION}/${nodeArchiveName}`,
    nodeArchive,
  );
  await download(
    `https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt`,
    shasums,
  );
  await verifyNodeArchive(nodeArchive, nodeArchiveName, shasums);

  const extracted = join(buildRoot, "node");
  await mkdir(extracted, { recursive: true });
  await run("/usr/bin/tar", ["-xzf", nodeArchive, "-C", extracted]);
  await copyFile(join(extracted, nodeDirectory, "bin", "node"), join(runtime, "node"));
  await chmod(join(runtime, "node"), 0o755);
  await copyFile(join(extracted, nodeDirectory, "LICENSE"), join(licenses, "Node-LICENSE"));
  // Hosted macOS runners have limited free space. Once the verified runtime
  // and license are copied, retaining the archive and full Node tree only
  // increases peak usage while the second architecture is assembled.
  await rm(extracted, { recursive: true, force: true });
  await rm(nodeArchive, { force: true });

  for (const name of [
    "spine-app.mjs",
    "spine-view.js",
    "spine-electron-main-hook.cjs",
    "compatibility.json",
    "README.md",
    "THIRD_PARTY_NOTICES.md",
  ]) {
    await copyFile(join(ROOT, name), join(wrapper, name));
  }
  await cp(join(ROOT, "bin"), join(wrapper, "bin"), { recursive: true });
  await copyFile(
    join(ROOT, "lib", "main-inspector.mjs"),
    join(wrapper, "lib", "main-inspector.mjs"),
  );
  await copyFile(
    join(ROOT, "lib", "main-hook-readiness.mjs"),
    join(wrapper, "lib", "main-hook-readiness.mjs"),
  );
  await copyFile(
    join(ROOT, "lib", "app-server-output-filter.mjs"),
    join(wrapper, "lib", "app-server-output-filter.mjs"),
  );
  await copyFile(
    join(ROOT, "lib", "app-server-protocol-adapter.mjs"),
    join(wrapper, "lib", "app-server-protocol-adapter.mjs"),
  );
  await copyFile(
    join(ROOT, "lib", "spine-codex-compatibility.mjs"),
    join(wrapper, "lib", "spine-codex-compatibility.mjs"),
  );
  await copyFile(
    join(ROOT, "lib", "desktop-bundle-contract.mjs"),
    join(wrapper, "lib", "desktop-bundle-contract.mjs"),
  );
  await copyFile(
    join(ROOT, "lib", "macos-inspector-clone.mjs"),
    join(wrapper, "lib", "macos-inspector-clone.mjs"),
  );
  await chmod(join(wrapper, "bin", "spine-codex"), 0o755);

  await writeFile(join(macos, BUNDLE_NAME), appLauncher(), { mode: 0o755 });
  await writeFile(join(contents, "Info.plist"), infoPlist(architecture));
  await createIcon(resources, buildRoot);

  await run("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", app]);
  await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);

  await mkdir(stage, { recursive: true });
  await cp(app, join(stage, `${BUNDLE_NAME}.app`), { recursive: true });
  await symlink("/Applications", join(stage, "Applications"));
  await rm(app, { recursive: true, force: true });
  await rm(dmg, { force: true });
  await run("/usr/bin/hdiutil", [
    "create",
    "-volname",
    BUNDLE_NAME,
    "-srcfolder",
    stage,
    "-ov",
    "-format",
    "UDZO",
    dmg,
  ]);
  const digest = await sha256(dmg);
  await writeFile(`${dmg}.sha256`, `${digest}  ${dmgName}\n`);
  console.log(`${dmgName}  ${digest}`);
}

function valueAfter(option) {
  const index = process.argv.indexOf(option);
  return index < 0 ? null : process.argv[index + 1];
}

async function download(url, destination) {
  try {
    await readFile(destination);
    return;
  } catch {}
  const temporary = `${destination}.download`;
  await rm(temporary, { force: true });
  await run("/usr/bin/curl", ["-fL", "--retry", "3", "-o", temporary, url]);
  await import("node:fs/promises").then(({ rename }) => rename(temporary, destination));
}

async function verifyNodeArchive(archive, archiveName, shasumsPath) {
  const shasums = await readFile(shasumsPath, "utf8");
  const line = shasums.split(/\r?\n/).find((entry) => entry.endsWith(`  ${archiveName}`));
  if (!line) throw new Error(`Node checksum is unavailable for ${archiveName}`);
  const expected = line.split(/\s+/)[0];
  const actual = await sha256(archive);
  if (actual !== expected) throw new Error(`Node checksum mismatch for ${archiveName}`);
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function createIcon(resources, buildRoot) {
  const master = join(buildRoot, "AppIcon.png");
  const source = join(ROOT, "assets", "app-icon.svg");
  const iconset = join(buildRoot, "AppIcon.iconset");
  await mkdir(iconset, { recursive: true });
  try {
    await run("/usr/bin/sips", [
      "-s", "format", "png", source, "--out", master,
    ]);
  } catch {
    await run("/usr/bin/qlmanage", [
      "-t", "-s", "1024", "-o", buildRoot, source,
    ]);
    await rename(join(buildRoot, "app-icon.svg.png"), master);
  }
  const sizes = [
    [16, "icon_16x16.png"],
    [32, "icon_16x16@2x.png"],
    [32, "icon_32x32.png"],
    [64, "icon_32x32@2x.png"],
    [128, "icon_128x128.png"],
    [256, "icon_128x128@2x.png"],
    [256, "icon_256x256.png"],
    [512, "icon_256x256@2x.png"],
    [512, "icon_512x512.png"],
    [1024, "icon_512x512@2x.png"],
  ];
  for (const [size, name] of sizes) {
    await run("/usr/bin/sips", ["-z", String(size), String(size), master, "--out", join(iconset, name)]);
  }
  await run("/usr/bin/iconutil", ["-c", "icns", iconset, "-o", join(resources, "AppIcon.icns")]);
}

function appLauncher() {
  return `#!/bin/sh
set -u
resources=$(CDPATH= cd -- "$(dirname -- "$0")/../Resources" && pwd)
node="$resources/runtime/node"
entry="$resources/wrapper/spine-app.mjs"
output_file=$(/usr/bin/mktemp "\${TMPDIR:-/tmp}/spine-codex-app.XXXXXX")
trap '/bin/rm -f "$output_file"' EXIT
if "$node" "$entry" "$@" >"$output_file" 2>&1; then
  exit 0
fi
message=$(/usr/bin/tail -c 12000 "$output_file")
/usr/bin/osascript - "$message" <<'APPLESCRIPT' >/dev/null
on run argv
  display dialog (item 1 of argv) with title "SpineCodex App" buttons {"Close"} default button "Close" with icon stop
end run
APPLESCRIPT
exit 1
`;
}

function infoPlist(architecture) {
  const [major, minor, patch, revision = "0"] = VERSION.split(".");
  const marketingVersion = `${major}.${minor}.${patch}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleDisplayName</key><string>${BUNDLE_NAME}</string>
  <key>CFBundleExecutable</key><string>${BUNDLE_NAME}</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundleIdentifier</key><string>${BUNDLE_ID}</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>${BUNDLE_NAME}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${marketingVersion}</string>
  <key>CFBundleVersion</key><string>${revision}</string>
  <key>LSArchitecturePriority</key><array><string>${architecture === "arm64" ? "arm64" : "x86_64"}</string></array>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
`;
}

function run(command, commandArgs) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, commandArgs, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (status) => {
      if (status === 0) resolvePromise();
      else reject(new Error(`${command} exited with status ${status}`));
    });
  });
}
