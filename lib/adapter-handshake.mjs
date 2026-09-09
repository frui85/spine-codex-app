import { writeFileSync, renameSync } from "node:fs";
import { readFile } from "node:fs/promises";
export function createAdapterHandshake(path) {
  let initializeId;
  const record = (state) => {
    if (!path) return;
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(
      temporary,
      JSON.stringify({
        schemaVersion: 1,
        state,
        pid: process.pid,
        timestamp: new Date().toISOString(),
      }),
      { mode: 0o600 },
    );
    renameSync(temporary, path);
  };
  return {
    client(line) {
      try {
        const value = JSON.parse(line);
        if (value.method === "initialize") initializeId = value.id;
      } catch {}
    },
    server(line) {
      let value;
      try {
        value = JSON.parse(line);
      } catch {
        return;
      }
      if (
        initializeId != null &&
        value.id === initializeId &&
        value.result != null && typeof value.result === "object"
      )
        record("initialized");
    },
  };
}
export async function waitForAdapter(
  path,
  { timeoutMs = 20000, isRunning = () => true } = {},
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && isRunning()) {
    try {
      const status = JSON.parse(await readFile(path, "utf8"));
      if (status.state === "initialized") return status;
    } catch (error) {
      if (error.code !== "ENOENT" && !(error instanceof SyntaxError))
        throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    "Desktop did not initialize through the private CLI adapter; refusing to report readiness.",
  );
}
