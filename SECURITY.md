# Security

## Reporting

Please report suspected vulnerabilities privately through GitHub Security Advisories for this repository. Do not include credentials, conversation content, SSH configuration, or private source code in a public issue.

## Trust boundary

SpineCodex App opens Codex Desktop with a loopback-only Chromium debugging port, validates that the target WebSocket is on the reserved loopback port, injects the renderer, and exits. While the launcher is active, other local processes running as the same user may be able to reach that debugging endpoint. The wrapper does not expose it on a network interface.

The Electron main-process compatibility hook is version-sensitive and fails closed when the expected Codex bundle structure is absent. The launcher passes an absolute renderer path and SHA-256 digest; the hook verifies both before keeping event-driven recovery listeners, and executes that source only in the exact `app://-/index.html` main surface after a completed load. It does not poll, patch `app.asar`, alter the Codex App signature, modify SSH configuration, or install Codex Desktop or SpineCodex.
