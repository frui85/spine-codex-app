# SpineCodex App v0.3.3.4 中文发布说明

[English release notes](RELEASE_NOTES_v0.3.3.4.md)

这是一个仅 App 的启动修复版本，解决当前 Codex Desktop 关闭 Electron
`NODE_OPTIONS` 和 Node CLI Inspector fuse 时的注入超时。官方
`@spinejit/spine-codex@0.3.3` 基线保持不变。

## 兼容性

| 组件 | 发布状态 |
|---|---|
| SpineCodex App | 0.3.3.4 |
| SpineCodex 本地最低版本 | 0.2.2 |
| SpineCodex 推荐基线 | 0.3.3 |
| SpineCodex 0.3.3 的 Codex 兼容身份 | 0.147.0 |
| 已验证 Codex Desktop | 26.810.41047、26.818.41509、26.825.51511、26.901.20858 |

## macOS Inspector 启动修复

当 Desktop fuse 使 `--inspect-brk` 失效时，启动器现在分配仅限回环地址的
`--inspect-port`，只向本次新启动的 Desktop PID 发送 `SIGUSR1` 开启运行时
Inspector，再通过 CDP 暂停进程，并在加载主进程 hook 前校验目标 PID。
找不到安全目标时仍然 fail closed。

不会修改原始 ChatGPT.app、官方 SpineCodex CLI 或用户会话数据。

## 验证

- `npm run check` 通过，包含发布边界和运行时 Inspector 回归覆盖。
- `spine-app --diagnose --json` 在 Desktop `26.901.20858`、`NODE_OPTIONS fuse:
  off` 环境下继续通过。
