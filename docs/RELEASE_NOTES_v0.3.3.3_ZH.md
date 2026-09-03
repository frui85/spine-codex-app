# SpineCodex App v0.3.3.3

[English release notes](RELEASE_NOTES_v0.3.3.3.md)

这是一个仅 App 的兼容更新，用于适配当前 Codex Desktop
`26.901.20858`。官方 `@spinejit/spine-codex@0.3.3` 保持不变。

## 兼容性

| 组件 | 发布状态 |
|---|---|
| SpineCodex App | 0.3.3.3 |
| SpineCodex 本地最低版本 | 0.2.2 |
| SpineCodex 推荐基线 | 0.3.3 |
| SpineCodex 0.3.3 的 Codex 兼容身份 | 0.147.0 |
| 已验证 Codex Desktop | 26.810.41047、26.818.41509、26.825.51511、26.901.20858 |

## macOS fuse 后备路径

较新的 Codex Desktop 可能关闭 Electron `NODE_OPTIONS` fuse。启动器现在会直接
启动 Desktop 可执行文件，分配新的仅限回环地址的 `--inspect-brk` 端口，通过
Node Inspector 协议加载 SpineCodex 主进程 hook，恢复暂停进程后立即关闭
Inspector 连接。Renderer 仍然只有在收到已验证的 `ready` 握手后才会注入。

启动前仍会只读扫描 bundle 契约。未知、歧义或 Inspector 握手失败时继续
fail closed。

## 验证

- `spine-app --diagnose --json` 已在 `NODE_OPTIONS fuse: off` 的 Desktop
  `26.901.20858` 上通过，并确认 bundle 契约兼容。
- 主进程 Inspector 注入、Renderer 和发布边界测试均已在本地通过。
