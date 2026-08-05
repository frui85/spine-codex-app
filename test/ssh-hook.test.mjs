import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const hookPath = new URL(
  "../spine-electron-main-hook.cjs",
  import.meta.url,
);
const wrapperPath = new URL(
  "../spine-app.mjs",
  import.meta.url,
);
const shimPath = new URL(
  "../bin/spine-codex",
  import.meta.url,
);

const hook = require(fileURLToPath(hookPath));
const hookSource = await readFile(hookPath, "utf8");
const wrapperSource = await readFile(wrapperPath, "utf8");
const shimSource = await readFile(shimPath, "utf8");

assert.equal(hook.DEFAULT_MIN_SPINE_VERSION, "0.2.2");
assert.deepEqual(hook.parseVersion("0.2.2"), [0, 2, 2]);
assert.deepEqual(hook.parseVersion("v1.3.5+build.7"), [1, 3, 5]);
assert.equal(hook.parseVersion("0.2.2-beta.1"), null);
assert.equal(hook.versionAtLeast("0.2.2", "0.2.2"), true);
assert.equal(hook.versionAtLeast("0.2.3", "0.2.2"), true);
assert.equal(hook.versionAtLeast("1.0.0", "0.2.2"), true);
assert.equal(hook.versionAtLeast("0.2.1", "0.2.2"), false);

function versionFixture({ check, argument, zero, compare, minimum, exportName }) {
  return (
    "var exports={};" +
    `${minimum}=\`0.141.0\`,` +
    "prefix=`codex-app-server-version-unsupported:`," +
    `${zero}=\`0.0.0\`;` +
    `function ${compare}(e,t){` +
    "let a=e.split(/[.+-]/).slice(0,3).map(Number)," +
    "b=t.split(/[.+-]/).slice(0,3).map(Number);" +
    "for(let i=0;i<3;i+=1){if(a[i]!==b[i])return a[i]-b[i]}return 0}" +
    `function ${check}(${argument}){return ` +
    `${argument}===${zero}||${compare}(${argument},${minimum})>=0}` +
    `Object.defineProperty(exports,\`${exportName}\`,` +
    `{enumerable:!0,get:function(){return ${check}}})`
  );
}

for (const fixture of [
  {
    check: "oldCheck",
    argument: "e",
    zero: "oldZero",
    compare: "oldCompare",
    minimum: "oldMinimum",
    exportName: "wc",
  },
  {
    check: "newCheck",
    argument: "candidate",
    zero: "newZero",
    compare: "newCompare",
    minimum: "newMinimum",
    exportName: "mc",
  },
]) {
  const source = versionFixture(fixture);
  const patched = hook.patchVersionCompatibilitySource(source, "0.2.2");
  const check = Function(`${patched};return ${fixture.check}`)();
  assert.equal(check("0.0.0"), true);
  assert.equal(check("0.141.0"), true);
  assert.equal(check("0.2.2"), true);
  assert.equal(check("0.2.2+build.7"), true);
  assert.equal(check("0.3.0"), true);
  assert.equal(check("0.2.3-beta.1"), false);
  assert.equal(check("0.2.1"), false);
  assert.equal(
    hook.patchVersionBundleCandidateSource(
      "/app/.vite/build/src-Bn_6ASpg.js",
      source,
      "0.2.2",
    ),
    patched,
  );
}
assert.equal(
  hook.patchVersionBundleCandidateSource(
    "/app/.vite/build/src-runtime.js",
    "const unrelated = true;",
  ),
  null,
);
assert.throws(
  () => hook.patchVersionCompatibilitySource("const unrelated = true;"),
  /marker was not found/,
);
assert.doesNotMatch(hookSource, /value\.wc|value\.Cc|value\.Sc/);

const remoteSelectorSource =
  "function Pae(){let e=process.env.CODEX_CLI_PATH;if(e==null)return null;" +
  "let t=e.trim();return t.length===0?null:t}" +
  "function Fae(e){return/[\\\\/]/.test(e)||/^[a-zA-Z]:/.test(e)}" +
  "function Iae(){let e=Pae();return e==null||Fae(e)?null:e}" +
  "function $S(){return Iae()??Aae}";
const patchedRemoteSelector = hook.patchRemoteCliSelectorSource(
  remoteSelectorSource,
);
assert.match(
  patchedRemoteSelector,
  /process\.env\.SPINE_CODEX_REMOTE_CLI\?\.trim\(\)\|\|Pae\(\)/,
);
assert.match(patchedRemoteSelector, /return e==null\|\|Fae\(e\)\?null:e/);
assert.throws(
  () => hook.patchRemoteCliSelectorSource("const unrelated = true;"),
  /marker was not found/,
);

assert.equal(hook.isMainBundleFilename("main-dcXtv3U5.js"), true);
assert.equal(hook.isMainBundleFilename("main--A7m_SpR.js"), true);
assert.equal(hook.isMainBundleFilename("main.js"), false);
assert.equal(hook.isMainBundleFilename("renderer-main-dcXtv3U5.js"), false);
assert.equal(hook.isSharedBundleFilename("src-Bn_6ASpg.js"), true);
assert.equal(hook.isSharedBundleFilename("src-CLstCQVF.js"), true);
assert.equal(hook.isSharedBundleFilename("renderer-src-Bn_6ASpg.js"), false);
assert.equal(
  hook.patchMainBundleCandidateSource(
    "/app/.vite/build/main-dcXtv3U5.js",
    "const unrelated = true;",
  ),
  null,
);
assert.equal(
  hook.patchMainBundleCandidateSource(
    "/app/.vite/build/renderer-dcXtv3U5.js",
    remoteSelectorSource,
  ),
  null,
);
for (const filename of ["main-dcXtv3U5.js", "main--A7m_SpR.js"]) {
  const candidate = hook.patchMainBundleCandidateSource(
    `/app/.vite/build/${filename}`,
    remoteSelectorSource,
  );
  assert.match(candidate, /process\.env\.SPINE_CODEX_REMOTE_CLI/);
}

assert.match(wrapperSource, /REMOTE_CLI_NAME = "spine-codex"/);
assert.match(wrapperSource, /MIN_SPINE_CODEX_VERSION = "0\.2\.2"/);
assert.match(wrapperSource, /CODEX_CLI_PATH=\$\{LOCAL_CLI_SHIM\}/);
assert.match(wrapperSource, /SPINE_CODEX_REMOTE_CLI=\$\{REMOTE_CLI_NAME\}/);
assert.match(wrapperSource, /PATH=\$\{appSearchPath\}/);
assert.match(wrapperSource, /NODE_OPTIONS=\$\{nodeOptions\}/);
assert.match(wrapperSource, /SPINE_CODEX_MIN_VERSION=/);
assert.match(wrapperSource, /--require \$\{JSON\.stringify\(ELECTRON_MAIN_HOOK\)\}/);
assert.match(wrapperSource, /readNodeOptionsFuse/);
assert.match(wrapperSource, /NODE_OPTIONS_FUSE_INDEX = 2/);
assert.doesNotMatch(wrapperSource, /CODEX_CLI_PATH=\$\{REMOTE_CLI_NAME\}/);

assert.match(shimSource, /SPINE_CODEX_BINARY/);
assert.match(shimSource, /--disable image_generation/);
assert.match(shimSource, /"\$@"/);

console.log(
  "Spine SSH command selection, local shim, and 0.2.2 main-process compatibility checks passed",
);
