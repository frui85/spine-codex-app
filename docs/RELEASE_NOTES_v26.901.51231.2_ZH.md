# SpineCodex App v26.901.51231.2 中文发布说明

[English release notes](RELEASE_NOTES_v26.901.51231.2.md)

本次为适配 **Codex Desktop 26.901.51231** 的 macOS 菜单更新。

## 菜单语言

- 菜单默认英文，通过 **Language / 语言** 选择 **English**、**简体中文** 或 **跟随系统**，当前选项显示勾选标记。
- 菜单状态、适配窗口、确认弹窗、辅助功能标签和复制信息立即更新，无需重启 Desktop。
- 跟随系统按 macOS 首选语言匹配：中文区域及脚本变体统一使用简体中文；暂不支持的语言回退英文。
- 语言偏好独立于启动模式，保存于 macOS 偏好域 `io.github.frui85.spine-status.preferences` 的 `menuLanguage` 键，后续启动继续生效。
- 原始诊断错误保留原文。菜单栏图标采用官方 Spine 标志。

## 兼容基线

| 组件 | 版本 |
|---|---|
| Desktop 目标 | 26.901.51231 |
| 官方 SpineCodex / Codex CLI | 0.3.3 / 0.147.0 |
| 补充适配的 xiurui-pan fork / Codex CLI | 0.4.1 / 0.153.4 |

仍默认副本模式，支持外部适配器与自动兜底，沿用现有 CLI 和 Desktop 适配基线。

## 验证

- 完整源码检查包含 77 项测试，以及 Renderer 和 SSH 回归检查。
- 原生 Swift 测试覆盖语言/区域匹配、不支持语言回退、偏好保存、系统语言刷新和已有状态快照的即时翻译。
- 本地原生预览验证中英文菜单和状态窗口、语言勾选标记、中文系统下的跟随系统选项及英文重启确认框。
- 发布包包含 Apple Silicon、Intel DMG 及 SHA-256 校验文件；Intel 运行尚未进行 Intel Mac 实机验证。
- 本地 Apple Silicon 与 Intel 构建通过严格 App 签名、DMG 完整性、SHA-256、包版本与随包源码核对；Apple Silicon 随包启动器兼容诊断通过。
