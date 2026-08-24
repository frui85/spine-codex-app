import { spawn } from "node:child_process";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, parse } from "node:path";
import { createInterface } from "node:readline";

const PRODUCT_PACKAGE_NAME = "@spinejit/spine-codex";
const VERSION_PATTERN = /(?:^|\s)v?(\d+\.\d+\.\d+)(?=\s|$)/;
const LEGACY_IDENTITY_CEILING = "0.100.0";

export function parseCliVersion(output) {
  return String(output).match(VERSION_PATTERN)?.[1] ?? null;
}

export function compareVersions(left, right) {
  const a = String(left).split(".").map(Number);
  const b = String(right).split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

export async function inspectSpineCodexIdentity(binaryPath, compatibilityVersion) {
  const product = await findProductPackage(binaryPath);
  if (product) {
    return {
      mode: "dual",
      productVersion: product.version,
      productVersionSource: "npm-package",
      productPackagePath: product.path,
      compatibilityVersion,
    };
  }

  if (compareVersions(compatibilityVersion, LEGACY_IDENTITY_CEILING) < 0) {
    return {
      mode: "legacy",
      productVersion: compatibilityVersion,
      productVersionSource: "legacy-cli-output",
      productPackagePath: null,
      compatibilityVersion,
    };
  }

  return {
    mode: "compatibility-only",
    productVersion: null,
    productVersionSource: "unavailable",
    productPackagePath: null,
    compatibilityVersion,
  };
}

async function findProductPackage(binaryPath) {
  let resolved;
  try {
    resolved = await realpath(binaryPath);
  } catch {
    resolved = binaryPath;
  }

  const candidates = new Set([
    join(dirname(binaryPath), "node_modules", "@spinejit", "spine-codex", "package.json"),
    join(dirname(resolved), "node_modules", "@spinejit", "spine-codex", "package.json"),
  ]);
  for (const start of [dirname(resolved), dirname(binaryPath)]) {
    let directory = start;
    while (directory !== parse(directory).root) {
      candidates.add(join(directory, "package.json"));
      directory = dirname(directory);
    }
  }

  for (const path of candidates) {
    try {
      const metadata = JSON.parse(await readFile(path, "utf8"));
      if (
        metadata?.name === PRODUCT_PACKAGE_NAME &&
        /^\d+\.\d+\.\d+$/.test(metadata.version)
      ) {
        return { path, version: metadata.version };
      }
    } catch {}
  }
  return null;
}

function unsupportedMethod(error) {
  if (error?.code === -32601) return true;
  return /unknown method|unknown variant|method not found|unsupported method|not implemented/i.test(
    String(error?.message ?? ""),
  );
}

export async function probeAppsProtocol(binaryPath, options = {}) {
  const timeoutMs = options.timeoutMs ?? 7_000;
  const codexHome = await mkdtemp(join(tmpdir(), "spine-app-protocol-"));
  const shell = process.platform === "win32" && /\.(?:cmd|bat)$/i.test(binaryPath);
  let child;
  try {
    child = spawn(
      binaryPath,
      ["--disable", "image_generation", "app-server", "--stdio"],
      {
        env: {
          ...process.env,
          CODEX_HOME: codexHome,
          PATH: options.searchPath ?? process.env.PATH,
        },
        shell,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    return await runProtocolProbe(child, timeoutMs);
  } catch (error) {
    return { mode: "unavailable", reason: error.message };
  } finally {
    try { child?.stdin.end(); } catch {}
    try { child?.kill(); } catch {}
    await rm(codexHome, { recursive: true, force: true });
  }
}

function runProtocolProbe(child, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    let installedNative = false;
    let stderr = "";
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      lines.close();
      resolve(result);
    };
    const send = (message) => {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    };
    const lines = createInterface({ input: child.stdout });
    const timer = setTimeout(() => {
      finish({ mode: "unavailable", reason: "app-server protocol probe timed out" });
    }, timeoutMs);

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-4_000);
    });
    child.once("error", (error) => {
      finish({ mode: "unavailable", reason: error.message });
    });
    child.stdin.once("error", (error) => {
      finish({ mode: "unavailable", reason: error.message });
    });
    child.once("exit", (status) => {
      if (!settled) {
        const detail = stderr.trim().split(/\r?\n/).at(-1);
        finish({
          mode: "unavailable",
          reason: detail || `app-server exited with status ${status}`,
        });
      }
    });
    lines.on("line", (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (message.id === 1) {
        if (message.error || !message.result) {
          finish({ mode: "unavailable", reason: message.error?.message ?? "initialize failed" });
          return;
        }
        send({ method: "initialized" });
        send({ id: 2, method: "app/installed", params: { forceRefresh: false } });
        return;
      }
      if (message.id === 2) {
        if (message.error && !unsupportedMethod(message.error)) {
          finish({ mode: "unavailable", reason: message.error.message ?? "app/installed failed" });
          return;
        }
        installedNative = !message.error;
        send({ id: 3, method: "app/read", params: { appIds: [], includeTools: true } });
        return;
      }
      if (message.id === 3) {
        if (message.error && !unsupportedMethod(message.error)) {
          finish({ mode: "unavailable", reason: message.error.message ?? "app/read failed" });
          return;
        }
        finish({
          mode: installedNative && !message.error ? "native" : "legacy-fallback",
          reason: null,
        });
      }
    });

    send({
      id: 1,
      method: "initialize",
      params: {
        clientInfo: {
          name: "spine-codex-app-diagnose",
          title: "SpineCodex App diagnostics",
          version: "0.3.2.0",
        },
        capabilities: { experimentalApi: true },
      },
    });
  });
}
