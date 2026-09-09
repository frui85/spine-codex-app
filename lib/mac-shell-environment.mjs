// Adapted from izumedonabe/spine-codex-app 0a6a3a1 (Apache-2.0).
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, basename } from "node:path";
import { spawn } from "node:child_process";
const quote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
export async function createMacShellEnvironment(
  adapterDirectory,
  {
    env = process.env,
    root = tmpdir(),
    originalDirectory = env.ZDOTDIR || homedir(),
  } = {},
) {
  // ZDOTDIR has no meaning for bash/fish: fail explicitly instead of silently
  // launching an unfiltered CLI. No user startup file is changed.
  if (basename(env.SHELL || "/bin/zsh") !== "zsh")
    throw new Error(
      "External adapter mode currently requires a zsh login shell; use clone mode for bash/fish.",
    );
  const directory = await mkdtemp(join(root, "spine-app-shell-"));
  const enforce =
    `export ZDOTDIR=${quote(directory)}\n` +
    `_spine_adapter_dir=${quote(adapterDirectory)}\n` +
    `path=("$_spine_adapter_dir" "\${(@)path:#$_spine_adapter_dir}")\nexport PATH\nunset _spine_adapter_dir\n`;
  try {
    for (const name of [
      ".zshenv",
      ".zprofile",
      ".zshrc",
      ".zlogin",
      ".zlogout",
    ]) {
      const file = quote(join(originalDirectory, name));
      await writeFile(
        join(directory, name),
        `if [[ -r ${file} ]]; then\n source ${file}\nfi\n${enforce}`,
        { mode: 0o600 },
      );
    }
    return {
      env: { ZDOTDIR: directory },
      dispose: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
export async function verifyLocalAdapter(expectedPath, env) {
  const marker = "__SPINE_ADAPTER_PATH__=";
  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      env.SHELL || "/bin/zsh",
      ["-lic", `printf '\\n${marker}%s\\n' "$(whence -p spine-codex)"`],
      { env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    let errorText = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Login shell adapter verification timed out"));
    }, 5000);
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      errorText += chunk;
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, output, errorText });
    });
  });
  const selected = result.output
    .split("\n")
    .find((line) => line.startsWith(marker))
    ?.slice(marker.length);
  if (result.code !== 0 || selected !== expectedPath)
    throw new Error(
      "Login shell did not select the private SpineCodex adapter; use clone mode or repair the shell configuration.",
    );
  return selected;
}
