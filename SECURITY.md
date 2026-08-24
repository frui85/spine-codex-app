# Security

## Reporting

Please report suspected vulnerabilities privately through GitHub Security Advisories for this repository. Do not include credentials, conversation content, SSH configuration, or private source code in a public issue.

## Trust boundary

SpineCodex App opens Codex Desktop with a loopback-only Chromium debugging port, validates that the target WebSocket is on the reserved loopback port, injects the renderer, and exits. While the launcher is active, other local processes running as the same user may be able to reach that debugging endpoint. The wrapper does not expose it on a network interface.

The Electron main-process compatibility hook is version-sensitive and fails closed when the expected Codex bundle structure is absent. On macOS, preflight reads the installed `app.asar` index and candidate bundle bytes without extracting or modifying the archive, and requires unique main-process, version-check, and local CLI-selector targets. The launcher passes an absolute renderer path and SHA-256 digest; the hook verifies both before keeping event-driven recovery listeners. On later main-surface loads it re-reads that same absolute local resource path, validates the Spine renderer identity, and executes it only in the exact `app://-/index.html` surface. This deliberately trusts files writable by the same local user—the same trust boundary as the loopback debugging endpoint—so an installed wrapper update can survive a renderer crash without restarting the Electron main process. It does not poll, patch `app.asar`, alter the Codex App signature, modify SSH configuration, or install Codex Desktop or SpineCodex.
