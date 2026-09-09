#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { inspectSpineCodexIdentity, parseCliVersion, probeAppsProtocol } from "../lib/spine-codex-compatibility.mjs";
import { matchCliBaseline } from "../lib/runtime-mode.mjs";
const binary = process.argv[2];
if (!binary) throw new Error("Usage: node scripts/regress-cli.mjs /absolute/path/to/spine-codex");
const path = resolve(binary);
const version = spawnSync(path,["--version"],{encoding:"utf8",timeout:10000});
if (version.status !== 0) throw new Error("SpineCodex --version failed");
const compatibilityVersion = parseCliVersion([version.stdout,version.stderr].join("\n"));
if (!compatibilityVersion) throw new Error("CLI compatibility identity missing");
const identity = await inspectSpineCodexIdentity(path,compatibilityVersion);
const protocol = await probeAppsProtocol(path);
const result = {productVersion:identity.productVersion,compatibilityVersion,baseline:matchCliBaseline(identity)?.kind ?? "unverified",appsProtocol:protocol.mode,passed:["native","legacy-fallback"].includes(protocol.mode)};
console.log(JSON.stringify(result,null,2));
if (!result.passed)process.exitCode=1;
