# SpineCodex App v0.3.3.0 中文发布说明

[English release notes](RELEASE_NOTES_v0.3.3.0.md)

本版本让 SpineCodex App 正式适配 `@spinejit/spine-codex@0.3.3`，并从 App
层恢复一种继承型子 Agent 的 durability 错位。Codex Desktop 与 SpineCodex
仍是需要分别安装的外部依赖。

## 兼容矩阵

| 组件 | 发布状态 |
|---|---|
| SpineCodex App | 0.3.3.0 |
| 本地 SpineCodex 最低版本 | 0.2.2 |
| SpineCodex 推荐基线 | 0.3.3 |
| SpineCodex 0.3.3 的 Codex 兼容身份 | 0.147.0 |
| 远端 SpineCodex 最低版本 | 0.2.2 |
| 已验证 Codex Desktop | 26.810.41047、26.818.41509 |

完整机器可读矩阵随包提供为 `compatibility.json`。

## 会话恢复

部分继承型子 Agent 会话在第一条 Spine durability 记录之前已有原生 Codex
历史。SpineCodex 可能因此拒绝恢复并报告：

```text
Fatal error: Spine durability is faulted: Spine replay failed: sampling commit does not match its sampling-started record
```

仅针对这一精确错误，App 现在会：

- 从原始 rollout 只读重建有效原生历史，不修改源会话；
- 强制校验继承父任务、原生压缩历史、epoch 0 Spine 边界和父任务 Spine 记录；
- 使用重建历史创建替代任务，并持久化旧任务 ID 到新任务 ID 的别名；
- 处理 `thread/status/changed` 先于 resume 响应到达的真实时序；
- 对其他 replay 或 durability 错误保持原样并继续 fail closed。

恢复逻辑位于 App 主进程与 Renderer 集成层，不会修改或替换已安装的
SpineCodex CLI。

## 协议契约

Tree 与 Spawn 通知 schema 已通过官方 SpineCodex 0.3.3 app-server 重新生成，
并作为带完整性校验的夹具固化。其契约与此前 App 集成保持一致。

## 安装

请单独安装 SpineCodex，再安装与 Mac 架构匹配的 SpineCodex App DMG：

```sh
npm install -g @spinejit/spine-codex@0.3.3
spine-codex --version
```

预期 CLI 兼容身份输出为 `codex-cli 0.147.0`。
