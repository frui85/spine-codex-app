# Security

## Reporting

Please report suspected vulnerabilities privately through GitHub Security Advisories for this repository. Do not include credentials, conversation content, SSH configuration, or private source code in a public issue.

## Trust boundary

SpineCodex App opens Codex Desktop with a loopback-only Chromium debugging port, validates that the target WebSocket is on the reserved loopback port, and keeps a narrow CDP session for the lifetime of the App so renderer reloads and replacements can recover. Other local processes running as the same user may be able to reach that debugging endpoint. The wrapper does not expose it on a network interface.

On macOS, current builds do not inject the Electron main process. The launcher uses the supported `CODEX_CLI_PATH` environment boundary plus a temporary shell environment to select its private local adapter, and the CDP supervisor executes only the SHA-256-revision-guarded renderer in the exact `app://-/index.html` surface. It polls only the loopback target list, never patches `app.asar`, alters the Codex App signature, modifies SSH configuration, or installs Codex Desktop or SpineCodex. Windows currently retains its version-sensitive Inspector/main-hook path, which fails closed when the expected structures are absent.
