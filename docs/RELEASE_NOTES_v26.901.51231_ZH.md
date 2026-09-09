# SpineCodex App v26.901.51231 中文发布说明

[English release notes](RELEASE_NOTES_v26.901.51231.md)

以 `0.3.3.6` 为基线，App 发版号改为对应兼容的 Codex Desktop 版本，本次目标为 `26.901.51231`。

| CLI 来源 | SpineCodex 产品版本 | Codex CLI 兼容版本 |
|---|---|---|
| [官方](https://github.com/GhabiX/SpineCodex) | 0.3.3 | 0.147.0 |
| [适配 fork](https://github.com/xiurui-pan/SpineCodex) | 0.4.1 | 0.153.4 |

官方 0.3.3 对应的 Codex 基线较老，因此同时适配 fork 0.4.1。官方 CLI 更新后继续回归适配官方版本，fork 作为补充支持。产品版本、CLI 兼容版本与 Desktop 版本分别展示，避免混淆。

## 状态栏与启动模式

- 默认副本模式，保留历史回放、超长 memory 恢复以及 SSH 启动保护。
- 外部适配器模式吸收官方的原签名 Desktop + CLI adapter + Renderer supervisor 架构。
- 自动兜底优先尝试副本，失败且原实例已停止后尝试外部模式。
- 新增原生 macOS 状态栏图标，显示实际模式、Desktop、CLI 双版本、适配基线及连接状态。
- 切换需要重启 Desktop，会中断正在执行的任务；切换成功后保存偏好，失败则尝试恢复原模式。
- 外部模式核验 zsh PATH 优先级和实际 app-server initialize 握手；不提供副本模式的回放恢复和 SSH bootstrap 补丁。
- Renderer 监控使用一秒间隔，仅连接精确主页面；只要本次启动的 Desktop 仍运行，就持续尝试恢复连接。

同一 Desktop 的后续 App 修订可使用第四段修订号；前三段始终对应 Desktop。历史版本保留旧编号。

版本匹配不等于所有 CLI 功能已验证，也不构成二进制来源证明。外部模式当前仅支持 zsh。新 Desktop 版本仍需分别回归两种模式；image_generation 继续临时禁用，Windows 发布保持关闭。

## 本次验证

- Desktop 26.901.51231 + 官方 SpineCodex 0.3.3 / CLI 0.147.0：外部和副本模式实际启动，initialize 与应用协议探测通过。
- 同一 Desktop + fork 0.4.1 / CLI 0.153.4：两种模式启动、原生状态界面、外部 → 副本 → 外部重启、偏好持久化通过。
- 禁用副本后，自动兜底实际转入 adapter 并完成初始化和 Renderer 就绪。
- 自动测试覆盖 target 替换、CDP 断连恢复、reload 注册、切换失败回退及外部模式不吞回放错误。本次未直接操作 Desktop UI 执行 reload。
- 原生 helper 已编译 arm64 和 x86_64；Intel 运行行为仍需 Intel Mac 实机回归。

后续官方 CLI 更新后先执行 `npm run regress:cli -- /absolute/path/to/spine-codex`，再回归两种 Desktop 启动模式及切换/恢复流程。initialize 通过不代表全部 agent 功能已验证。
