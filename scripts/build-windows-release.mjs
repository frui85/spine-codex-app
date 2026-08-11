#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  rm,
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
const MIN_SPINE_CODEX_VERSION = metadata.spineCodexVersion;
if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(VERSION)) {
  throw new Error(`invalid release version: ${VERSION}`);
}
if (VERSION !== SOURCE_VERSION) {
  throw new Error(`release version ${VERSION} does not match source ${SOURCE_VERSION}`);
}
if (!/^\d+\.\d+\.\d+$/.test(MIN_SPINE_CODEX_VERSION)) {
  throw new Error(`invalid minimum SpineCodex version: ${MIN_SPINE_CODEX_VERSION}`);
}
const NODE_VERSION = "v22.23.2";
const ARCHITECTURE = valueAfter("--arch") ?? "x64";
const CC = process.env.WINDOWS_CC || "x86_64-w64-mingw32-gcc";
const WINDRES = process.env.WINDOWS_WINDRES || "x86_64-w64-mingw32-windres";

if (ARCHITECTURE !== "x64") {
  throw new Error(`unsupported Windows architecture: ${ARCHITECTURE}`);
}

const buildRoot = join(ROOT, ".build", `windows-${ARCHITECTURE}`);
const downloads = join(ROOT, ".build", "downloads");
const dist = join(ROOT, "dist");
const releaseName = `SpineCodex-App-v${VERSION}-windows-${ARCHITECTURE}`;
const releaseRoot = join(buildRoot, releaseName);
const wrapper = join(releaseRoot, "wrapper");
const runtime = join(releaseRoot, "runtime");
const licenses = join(releaseRoot, "licenses");
const nodeDirectory = `node-${NODE_VERSION}-win-${ARCHITECTURE}`;
const nodeArchiveName = `${nodeDirectory}.zip`;
const nodeArchive = join(downloads, nodeArchiveName);
const shasums = join(downloads, `SHASUMS256-${NODE_VERSION}.txt`);
const archiveName = `${releaseName}.zip`;
const archive = join(dist, archiveName);

await rm(buildRoot, { recursive: true, force: true });
await mkdir(downloads, { recursive: true });
await mkdir(dist, { recursive: true });
await mkdir(join(wrapper, "bin"), { recursive: true });
await mkdir(join(wrapper, "lib"), { recursive: true });
await mkdir(runtime, { recursive: true });
await mkdir(licenses, { recursive: true });

await download(`https://nodejs.org/dist/${NODE_VERSION}/${nodeArchiveName}`, nodeArchive);
await download(`https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt`, shasums);
await verifyNodeArchive(nodeArchive, nodeArchiveName, shasums);

const extracted = join(buildRoot, "node");
await mkdir(extracted, { recursive: true });
await run("/usr/bin/unzip", ["-q", nodeArchive, "-d", extracted]);
await copyFile(join(extracted, nodeDirectory, "node.exe"), join(runtime, "node.exe"));
await copyFile(join(extracted, nodeDirectory, "LICENSE"), join(licenses, "Node-LICENSE"));

for (const name of [
  "spine-app.mjs",
  "spine-view.js",
  "spine-electron-main-hook.cjs",
  "README.md",
  "THIRD_PARTY_NOTICES.md",
]) {
  await copyFile(join(ROOT, name), join(wrapper, name));
}
await copyFile(join(ROOT, "bin", "spine-codex.mjs"), join(wrapper, "bin", "spine-codex.mjs"));
await copyFile(
  join(ROOT, "lib", "main-inspector.mjs"),
  join(wrapper, "lib", "main-inspector.mjs"),
);
await copyFile(
  join(ROOT, "lib", "app-server-output-filter.mjs"),
  join(wrapper, "lib", "app-server-output-filter.mjs"),
);
await copyFile(
  join(ROOT, "lib", "app-server-protocol-adapter.mjs"),
  join(wrapper, "lib", "app-server-protocol-adapter.mjs"),
);
await copyFile(join(ROOT, "LICENSE"), join(releaseRoot, "LICENSE"));
await copyFile(join(ROOT, "NOTICE"), join(releaseRoot, "NOTICE"));
await writeFile(join(releaseRoot, "README-Windows.txt"), windowsReadme());

const iconPng = join(buildRoot, "AppIcon.png");
const iconIco = join(buildRoot, "AppIcon.ico");
await run("/usr/bin/sips", [
  "-s", "format", "png", join(ROOT, "assets", "app-icon.svg"), "--out", iconPng,
]);
await run("/usr/bin/sips", ["-z", "256", "256", iconPng, "--out", iconPng]);
await run("/usr/bin/sips", ["-s", "format", "ico", iconPng, "--out", iconIco]);

const manifest = join(buildRoot, "spine-app.manifest");
const resource = join(buildRoot, "spine-app.rc");
const resourceObject = join(buildRoot, "spine-app-resource.o");
await writeFile(manifest, windowsManifest());
await writeFile(resource, windowsResource(iconIco, manifest));
await run(WINDRES, [resource, "-O", "coff", "-o", resourceObject]);

const launcherSource = join(ROOT, "scripts", "windows", "launcher.c");
const launcher = join(releaseRoot, "SpineCodex App.exe");
const cliShim = join(wrapper, "bin", "spine-codex.exe");
const commonCompilerArguments = [
  "-std=c11",
  "-municode",
  "-mwindows",
  "-Os",
  "-s",
  "-static",
];
await run(CC, [
  ...commonCompilerArguments,
  "-o", launcher,
  launcherSource,
  resourceObject,
  "-lshell32",
]);
await run(CC, [
  ...commonCompilerArguments,
  "-DSPINE_CLI_SHIM=1",
  "-o", cliShim,
  launcherSource,
  resourceObject,
  "-lshell32",
]);
await chmod(launcher, 0o755);
await chmod(cliShim, 0o755);

await rm(archive, { force: true });
await run("/usr/bin/zip", ["-q", "-r", "-X", archive, releaseName], {
  cwd: buildRoot,
});
const digest = await sha256(archive);
await writeFile(`${archive}.sha256`, `${digest}  ${archiveName}\n`);
console.log(`${archiveName}  ${digest}`);

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

async function verifyNodeArchive(archivePath, archiveFileName, shasumsPath) {
  const shasumsText = await readFile(shasumsPath, "utf8");
  const line = shasumsText
    .split(/\r?\n/)
    .find((entry) => entry.endsWith(`  ${archiveFileName}`));
  if (!line) throw new Error(`Node checksum is unavailable for ${archiveFileName}`);
  const expected = line.split(/\s+/)[0];
  const actual = await sha256(archivePath);
  if (actual !== expected) throw new Error(`Node checksum mismatch for ${archiveFileName}`);
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function windowsReadme() {
  return `SpineCodex App v${VERSION} — Windows x64 portable build\r\n\r\n` +
    "Requirements:\r\n" +
    "- Windows 10 build 17763 or newer\r\n" +
    "- The current Codex Desktop app from Microsoft Store\r\n" +
    `- SpineCodex ${MIN_SPINE_CODEX_VERSION} or newer installed separately\r\n\r\n` +
    "Run SpineCodex App.exe. The launcher discovers both external dependencies, " +
    "starts Codex with a loopback-only debugging port, injects Spine View, and exits.\r\n\r\n" +
    "This portable package contains only the wrapper and Node.js runtime. " +
    "It does not contain or install Codex Desktop or SpineCodex.\r\n";
}

function windowsManifest() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
    <security><requestedPrivileges>
      <requestedExecutionLevel level="asInvoker" uiAccess="false"/>
    </requestedPrivileges></security>
  </trustInfo>
  <application xmlns="urn:schemas-microsoft-com:asm.v3">
    <windowsSettings>
      <dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true/pm</dpiAware>
      <longPathAware xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">true</longPathAware>
    </windowsSettings>
  </application>
</assembly>
`;
}

function windowsResource(iconPath, manifestPath) {
  const resourcePath = (value) => value.replaceAll("\\", "/").replaceAll('"', '\\"');
  const [major, minor, patch, revision = 0] = VERSION.split(".").map(Number);
  return `1 ICON "${resourcePath(iconPath)}"
1 24 "${resourcePath(manifestPath)}"
1 VERSIONINFO
FILEVERSION ${major},${minor},${patch},${revision}
PRODUCTVERSION ${major},${minor},${patch},${revision}
BEGIN
  BLOCK "StringFileInfo"
  BEGIN
    BLOCK "040904B0"
    BEGIN
      VALUE "CompanyName", "SpineCodex App contributors"
      VALUE "FileDescription", "SpineCodex App launcher"
      VALUE "FileVersion", "${VERSION}"
      VALUE "InternalName", "SpineCodex App"
      VALUE "OriginalFilename", "SpineCodex App.exe"
      VALUE "ProductName", "SpineCodex App"
      VALUE "ProductVersion", "${VERSION}"
    END
  END
  BLOCK "VarFileInfo"
  BEGIN
    VALUE "Translation", 0x0409, 1200
  END
END
`;
}

function run(command, commandArguments, { cwd } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, commandArguments, { cwd, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (status) => {
      if (status === 0) resolvePromise();
      else reject(new Error(`${command} exited with status ${status}`));
    });
  });
}
