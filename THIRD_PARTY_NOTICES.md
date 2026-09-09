# Third-party notices

Release packages include a platform-specific Node.js runtime solely to execute this wrapper. Node.js is distributed under its own license, copied into the package at build time from the official Node.js distribution.

Codex Desktop and SpineCodex are required external applications. They are not included, downloaded, installed, or redistributed by this project.

- Codex Desktop is an OpenAI product: <https://chatgpt.com/download/>
- SpineCodex is independently maintained: <https://github.com/GhabiX/SpineCodex>

The external adapter shell setup and Renderer supervisor adapt code from
izumedonabe/spine-codex-app commit 0a6a3a1 (Apache-2.0), with local changes to
PATH precedence, handshake verification, process lifetime, polling, and cleanup.
Supplementary CLI compatibility targets xiurui-pan/SpineCodex v0.4.1:
<https://github.com/xiurui-pan/SpineCodex>. No CLI binaries are redistributed.
