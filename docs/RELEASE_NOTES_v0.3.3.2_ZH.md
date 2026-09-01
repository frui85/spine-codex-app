# SpineCodex App v0.3.3.2 中文发布说明

[English release notes](RELEASE_NOTES_v0.3.3.2.md)

本次仅更新 App，继续使用官方 `@spinejit/spine-codex@0.3.3` 基线，并修复
固定等待 5 秒导致的主进程 hook 启动假失败。Codex Desktop 与 SpineCodex
仍是需要分别安装的外部依赖。

## 兼容矩阵

| 组件 | 发布状态 |
|---|---|
| SpineCodex App | 0.3.3.2 |
| 本地 SpineCodex 最低版本 | 0.2.2 |
| SpineCodex 推荐基线 | 0.3.3 |
| SpineCodex 0.3.3 的 Codex 兼容身份 | 0.147.0 |
| 远端 SpineCodex 最低版本 | 0.2.2 |
| 已验证 Codex Desktop | 26.810.41047、26.818.41509、26.825.51511 |

完整机器可读矩阵随包提供为 `compatibility.json`。

## 感知进展的启动就绪等待

在较慢的启动中，Desktop 可能在 5 秒内到达 `main-patched`，但要稍晚才完成
Renderer 与 app-server 恢复注册。旧启动器会提前超时，并误称 preload 或
Renderer 注入没有加载，实际上 hook 随后已经进入 ready。

启动器现在会：

- 在支持的平台使用 20 秒初始 readiness deadline；
- 仅当 hook 依次推进到 `installed`、`main-patched`、`version-patched` 或
  `electron-integrations-installed` 等已知状态时，把当前 deadline 最多延长
  10 秒；
- 始终保留 30 秒总硬上限，保证启动不会无限等待；
- 在 deadline 边界与最后一个有界的 500 ms grace window 内重新读取状态；
- 继续要求 Renderer 和 app-server replay recovery 完整 ready；
- 分别报告从未观察到 preload 状态，以及 hook 已加载但异步集成未完成；
- 对 incompatible、异常、未知与不完整 `ready` 状态继续 fail closed。

启动完成后不会保留轮询或 watchdog。

## 验证

已在 ChatGPT/Codex Desktop `26.825.51511`（build 7377）验证完整启动路径、
主进程 hook、Renderer revision、安装包完整性和诊断。此前观察到的 hook 在
进程启动约 7 秒后 ready；新逻辑可以正常接受，同时没有放宽总失败边界。

自动化测试使用虚拟时钟，覆盖 7.2 秒慢启动、滑动进展 deadline、30 秒硬
上限、deadline 边界完成、final grace、状态缺失、部分 ready、不兼容状态、
异常 JSON 与非目标失败路径。

## 安装

请单独安装官方 SpineCodex，再安装与 Mac 架构匹配的 SpineCodex App DMG：

```sh
npm install -g @spinejit/spine-codex@0.3.3
spine-codex --version
```

预期 CLI 兼容身份输出为 `codex-cli 0.147.0`。
