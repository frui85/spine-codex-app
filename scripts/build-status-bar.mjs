import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const arch = args.includes("--arch")
  ? args[args.indexOf("--arch") + 1]
  : process.arch;
const bundle = args.includes("--output")
  ? resolve(args[args.indexOf("--output") + 1])
  : resolve(root, ".build/SpineCodex Status.app");
const output = resolve(bundle, "Contents/MacOS/spine-status-bar");
if (!["arm64", "x64"].includes(arch))
  throw new Error("unsupported status bar architecture");
await mkdir(dirname(output), { recursive: true });
await new Promise((resolvePromise, reject) => {
  const child = spawn(
    "/usr/bin/xcrun",
    [
      "swiftc",
      "-swift-version",
      "5",
      "-O",
      "-target",
      `${arch === "x64" ? "x86_64" : "arm64"}-apple-macosx14.0`,
      "-module-cache-path",
      resolve(root, ".build/swift-module-cache"),
      resolve(root, "scripts/macos/status-bar.swift"),
      "-o",
      output,
    ],
    { stdio: "inherit" },
  );
  child.once("error", reject);
  child.once("exit", (code) =>
    code === 0 ? resolvePromise() : reject(new Error(`swiftc exited ${code}`)),
  );
});
await writeFile(
  resolve(bundle, "Contents/Info.plist"),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>io.github.frui85.spine-status</string>
<key>CFBundleName</key><string>SpineCodex Status</string>
<key>CFBundleExecutable</key><string>spine-status-bar</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>LSUIElement</key><true/>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
`,
);
console.log(output);
