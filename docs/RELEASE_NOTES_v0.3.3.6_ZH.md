# SpineCodex App v0.3.3.6 中文发布说明

[English release notes](RELEASE_NOTES_v0.3.3.6.md)

修复私有 Desktop 副本独立变化后，启动器仍按原应用信息复用缓存，随后报
`Codex local CLI error marker was not found` 的启动故障。

现在签名完成后会记录副本自身的 Desktop 信息和 `app.asar` SHA-256，复用前核对实际内容。
副本发生变化或旧缓存缺少副本身份时，自动从已安装的 Desktop 重建。

## 兼容信息

| 组件 | 发布状态 |
|---|---|
| SpineCodex App | 0.3.3.6 |
| SpineCodex 本地最低版本 | 0.2.2 |
| SpineCodex 推荐基线 | 0.3.3 |
| SpineCodex 0.3.3 的 Codex 兼容身份 | 0.147.0 |
| 已验证 Desktop 版本 | 26.810.41047、26.818.41509、26.825.51511、26.901.20858、26.901.51231 |

本修复恢复与已安装原应用一致的兼容副本，不代表已兼容排障时发现的副本版本 `26.903.61454`。
原应用和用户会话保持不变；升级后首次启动会重建一次旧缓存。

本地及 fork 的维护分支已收拢到 `main`，纳入 SpineCodex / VS Code 集成 wiki，
保留现有兼容、回放恢复和应用列表状态切换修复。

## 验证

- 完整 wrapper 检查、克隆生命周期回归、Renderer 和 SSH hook 测试。
- 覆盖副本独立升级、同尺寸应用代码变化、旧 manifest 缺少副本身份等情况。
- 在 macOS 上重建 Desktop `26.901.51231` 副本，实际启动输出 `Spine Tree ready`，随后可正常复用。
- 已安装修复版通过严格代码签名校验。

GitHub Actions 自动构建 Apple Silicon、Intel 两个 macOS DMG，并发布 SHA-256 校验文件。
Windows 发布打包继续保持关闭，等待实机验证。
