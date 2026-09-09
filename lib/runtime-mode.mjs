import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const MODES = Object.freeze(["clone", "adapter", "auto"]);
export const MODE_LABELS = Object.freeze({
  clone: "副本模式",
  adapter: "外部适配器",
  auto: "自动兜底",
});
export const CLI_BASELINES = Object.freeze([
  {
    kind: "official",
    label: "官方适配基线",
    productVersion: "0.3.3",
    compatibilityVersion: "0.147.0",
    repository: "https://github.com/GhabiX/SpineCodex",
  },
  {
    kind: "fork",
    label: "fork 适配基线",
    productVersion: "0.4.1",
    compatibilityVersion: "0.153.4",
    repository: "https://github.com/xiurui-pan/SpineCodex",
  },
]);
export function validateMode(mode) {
  if (!MODES.includes(mode))
    throw new Error(
      `Unknown startup mode: ${mode}; use clone, adapter, or auto`,
    );
  return mode;
}
export function preferencePath(env = process.env) {
  return (
    env.SPINE_CODEX_PREFERENCES_PATH ||
    join(
      homedir(),
      "Library",
      "Application Support",
      "SpineCodex App",
      "preferences.json",
    )
  );
}
export async function readPreferences(path = preferencePath()) {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    return { mode: validateMode(value.mode) };
  } catch (error) {
    if (error.code === "ENOENT") return { mode: process.platform === "darwin" ? "adapter" : "clone" };
    throw new Error(`Cannot read startup preferences: ${error.message}`);
  }
}
export async function savePreferences(mode, path = preferencePath()) {
  validateMode(mode);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(
    temporary,
    JSON.stringify({ schemaVersion: 1, mode }, null, 2) + "\n",
    { mode: 0o600 },
  );
  await rename(temporary, path);
}
export function matchCliBaseline(identity) {
  return (
    CLI_BASELINES.find(
      (b) =>
        b.productVersion === identity?.productVersion &&
        b.compatibilityVersion === identity?.compatibilityVersion,
    ) ?? null
  );
}

// Serializes restart/switch transactions. A failed stop never starts another
// Desktop. Preferences commit only after readiness; failed starts roll back.
export class ModeController {
  constructor({ start, save = savePreferences, onState = () => {} }) {
    this.start = start;
    this.save = save;
    this.onState = onState;
    this.session = null;
    this.mode = process.platform === "darwin" ? "adapter" : "clone";
    this.busy = false;
  }
  async switchTo(mode, { persist = true } = {}) {
    validateMode(mode);
    if (this.busy) return false;
    this.busy = true;
    const previousMode = this.mode;
    const previous = this.session;
    this.onState({
      busy: true,
      status: previous ? "正在重启 Desktop…" : "正在启动…",
      requestedMode: mode,
    });
    try {
      if (previous) {
        await previous.stop();
        this.session = null;
      }
      try {
        this.session = await this.start(mode);
        if (persist) await this.save(mode);
        this.mode = mode;
      } catch (error) {
        if (this.session) {
          await this.session.stop();
          this.session = null;
        }
        if (previous) {
          this.onState({ status: "切换失败，正在恢复原模式…" });
          this.session = await this.start(previousMode);
        }
        throw error;
      }
      this.onState({
        status: "已就绪",
        requestedMode: mode,
        ...this.session.info,
      });
      return true;
    } catch (error) {
      this.onState({
        status: this.session ? "操作未完成，当前实例仍运行" : "启动失败",
        error: error.message,
        requestedMode: this.mode,
        ...this.session?.info,
      });
      throw error;
    } finally {
      this.busy = false;
      this.onState({ busy: false });
    }
  }
  async quit() {
    if (this.busy) return false;
    this.busy = true;
    this.onState({ busy: true, status: "正在退出 Desktop…" });
    try {
      await this.session?.stop();
      this.session = null;
      return true;
    } finally {
      this.busy = false;
      this.onState({ busy: false });
    }
  }
}
