# SpineCodex App v0.3.3.1 中文发布说明

[English release notes](RELEASE_NOTES_v0.3.3.1.md)

本次仅更新 App，继续使用官方 `@spinejit/spine-codex@0.3.3` 基线，并新增
超长 Spine memory fragment 的会话恢复。Codex Desktop 与 SpineCodex 仍是
需要分别安装的外部依赖。

## 兼容矩阵

| 组件 | 发布状态 |
|---|---|
| SpineCodex App | 0.3.3.1 |
| 本地 SpineCodex 最低版本 | 0.2.2 |
| SpineCodex 推荐基线 | 0.3.3 |
| SpineCodex 0.3.3 的 Codex 兼容身份 | 0.147.0 |
| 远端 SpineCodex 最低版本 | 0.2.2 |
| 已验证 Codex Desktop | 26.810.41047、26.818.41509 |

完整机器可读矩阵随包提供为 `compatibility.json`。

## Memory fragment 恢复

SpineCodex 0.3.3 的 `spine.close` 和 `spine.next` 接受最高 32 KiB memory，
但 context projection 会拒绝超过 8,000 UTF-8 bytes 的完整 memory fragment。
因此，工具已经接受的 memory 仍可能在下一次 context plan 让会话故障：

```text
Fatal error: Spine context plan failed: Spine memory fragment is 9005 bytes; maximum is 8000
```

继续同一会话后，错误还可能包装为：

```text
Fatal error: Spine durability is faulted: Spine context plan failed: Spine memory fragment is 9005 bytes; maximum is 8000
```

仅针对这些精确错误，App 现在会：

- 只读访问源 rollout，不修改它；
- 要求存在匹配的 `spine.close` 或 `spine.next` 调用、accepted 回执以及一致的
  fragment 字节数；
- 克隆有效历史，只在克隆历史中按 UTF-8 边界和观测到的投影预算缩短 memory；
- 恢复到替代任务，并持久化旧任务 ID 到新任务 ID 的别名；
- 处理 `thread/status/changed` 先于 resume 响应到达的真实时序；
- 对格式异常、边界大小以及无关的 context-plan、replay 和 durability 错误保持
  原样并继续 fail closed。

恢复逻辑完全位于 App 主进程与 Renderer 集成层，不会修补、重编译或替换已
安装的 SpineCodex CLI，也不会编辑原始会话 JSONL。

## 验证

恢复已使用截图对应的 9,005-byte 真实故障验证：源 rollout 重建出 262 个
history items，已接受的 8,960-byte memory 在克隆历史中缩短为 7,955 bytes，
原始 rollout 保持不变。回归测试覆盖首次及包装错误、UTF-8 多字节边界、
accepted 回执校验、非目标错误以及真实 app-server 通知时序。

## 安装

请单独安装官方 SpineCodex，再安装与 Mac 架构匹配的 SpineCodex App DMG：

```sh
npm install -g @spinejit/spine-codex@0.3.3
spine-codex --version
```

预期 CLI 兼容身份输出为 `codex-cli 0.147.0`。
