# Security

## Reporting

Report suspected vulnerabilities privately through GitHub Security Advisories. Do not include credentials, conversation content, SSH configuration, or private source code in public issues.

## Shared boundary

Both modes open a Chromium debugging port bound to loopback and accept only WebSocket endpoints on the reserved loopback port. Same-user local processes may reach that endpoint for the Desktop lifetime. Renderer selection is limited to the exact main `app://-/index.html` page and excludes the avatar overlay. The wrapper and its native menu bar remain running to supervise the session and handle user-requested restarts.

## Clone mode

The installed original Desktop is not modified. When Inspector fuses require it, the wrapper creates a private copy, re-enables the copy's Inspector fuse, and signs the copy ad hoc. Provisioning-only entitlements are removed from the copy, so its permission/keychain/push behavior can differ from the original application. The clone manifest records both source and signed-copy identity plus archive SHA-256; changed copies are rebuilt.

The version-sensitive main hook fails closed on missing or ambiguous bundle structure. Hook injection checks the launched PID. It modifies code in memory, not the on-disk app.asar. Event-driven main-window recovery validates the local renderer payload before injection. This trusts wrapper files writable by the same local user.

## External adapter mode

This mode runs the original signed Desktop without a main hook or private copy. It creates private temporary zsh startup files which source the user's existing configuration and enforce adapter PATH precedence. User startup files are never edited. Startup checks the selected executable and requires an actual initialize response observed by the private adapter. Temporary state remains until the owned Desktop exits.

The Renderer supervisor keeps reconnecting while its owned Desktop PID is alive. It does not provide clone-only replay/memory recovery or SSH bootstrap patches. SSH uses the remote host's own spine-codex command; local adapter paths are not sent to the remote host.

## Switching and packaging

A user mode change requires a normal Desktop restart and can interrupt active tasks. The native helper requests termination only for the tracked PID with a matching bundle path. A failed quit prevents another instance from starting. Preferences commit after readiness, and failed switches attempt to restore the prior mode. No force-kill fallback is used on macOS.

Release packages contain wrapper code, a compiled native status helper, and a fixed Node.js runtime. They do not download, install, or redistribute Desktop or SpineCodex binaries. Version-pair baseline matching is not binary provenance verification. Image generation remains disabled pending validation.
