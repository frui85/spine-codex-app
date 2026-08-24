# SpineCodex App v0.3.2.0 中文发布说明

[English release notes](RELEASE_NOTES_v0.3.2.0.md)

本版本让 SpineCodex App 正式适配 SpineCodex 0.3.2，不替换现有 Tree/Spawn
通知，也不删除 0.2.2 Apps 兼容适配器。Codex Desktop 与 SpineCodex 仍是
外部依赖，不会被打包进发布产物。

## 兼容矩阵

| 组件 | 发布状态 |
|---|---|
| SpineCodex App | 0.3.2.0 |
| 本地 SpineCodex 最低版本 | 0.2.2 |
| SpineCodex 推荐基线 | 0.3.2 |
| SpineCodex 0.3.2 的 Codex 兼容身份 | 0.147.0 |
| 远端 SpineCodex 最低版本 | 0.2.2 |
| 已验证 Codex Desktop | 26.810.41047、26.818.41509 |
| OpenAI Codex 0.149.1 | 不属于本版本 SpineCodex 基线 |

完整机器可读矩阵随包提供为 `compatibility.json`。

## 新增与调整

- 启动器从已安装 npm 包解析 SpineCodex 产品版本，并与 `codex-cli
  --version` 分开记录。产品元数据不可发现时，诊断会显示 `unknown`，并结合
  兼容身份和真实 app-server 探测判断可用性。
- `--diagnose --json` 使用稳定 schema，覆盖版本身份、Apps 协议模式、
  Desktop 版本与 bundle 契约、Renderer 校验和，以及本地/远程要求。
- macOS 诊断会只读检查已安装 `app.asar`。SSH 主进程目标、版本检查和本地
  CLI selector 必须各自唯一匹配，且版本与 selector 必须位于同一共享
  bundle，否则拒绝启动。Windows 保留权威运行时 Inspector 握手。
- SpineCodex 0.3.2 原生使用 `app/installed` 和 `app/read`；SpineCodex 0.2.2
  继续使用一次性分页 `app/list` 回退。
- Settings 可见且可写 stable `spine_spawn`；beta Memory Projection 继续
  可见，removed 与未知 stable 功能保持隐藏。
- Settings 显示所选主机、本地产品/兼容版本、Spawn 默认状态和 Memory
  Projection 状态。远端功能按 host 单独读取，绝不继承本地版本结论。
- 生成的 SpineCodex 0.3.2 Tree 与 Spawn schema 被固化为带完整性校验的测试
  夹具。公共通知方法与 Renderer 归一化数据入口保持不变。
- Renderer 源码按职责拆分到 `renderer/` 下的有序模块；发布时仍注入一个
  生成的 `spine-view.js`，并拒绝任何字节漂移。

## 已知边界

`image_generation` 继续禁用。虽然 SpineCodex 0.3.2 已将该功能标记为
stable，但在真实图片生成、消息回放、Spine Tree 更新与恢复行为通过端到端
门禁前，本 App 版本不会启用它。

## 诊断

先完整退出 Codex Desktop，然后运行：

```sh
./spine-app --diagnose
./spine-app --diagnose --json
```

Apps 协议结果为 `native`、`legacy-fallback` 或 `unavailable`。在 macOS 上，
Desktop 契约通过时还会列出唯一匹配的 main 与 shared bundle。

## 安装

请单独安装 SpineCodex，推荐 0.3.2；再安装与 Mac 架构匹配的 DMG，并从
**SpineCodex App** 启动，不要直接打开 Codex Desktop。

```sh
npm install -g @spinejit/spine-codex@0.3.2
spine-codex --version
```

macOS 发布包仍使用 ad-hoc 签名，未 notarize。Windows 发布自动化继续禁用，
等待更广泛真机和签名验证。
