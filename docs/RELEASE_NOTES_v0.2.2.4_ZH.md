# SpineCodex App v0.2.2.4 中文修复说明

> 发布日期：2026-08-11
>
> 适用环境：macOS 14+、ChatGPT/Codex Desktop `26.803.41515`、SpineCodex `0.2.2+`
>
> 发布性质：仅更新 SpineCodex App 包装层，不包含 Codex Desktop 或 SpineCodex

## 问题现象

新版 Codex Desktop 会调用 `app/installed` 与 `app/read`。SpineCodex 0.2.2
尚未实现这两个方法，因此 Desktop 会回退到分页 `app/list`。在特定状态下，
`app/list/updated` 又会让同一 Apps 查询失效并重新开始，主窗口与原生
`avatar-overlay` 窗口会同时解析数 MB 的目录消息。

现场采样中，主 Renderer 与 Overlay 的活动时间约有一半消耗在垃圾回收，
主 Renderer RSS 峰值超过 1.7 GiB；这不是 Spine Tree 运算或 Overlay 动画导致，
而是协议不兼容放大的 Apps 消息反馈循环。

## 修复方案

### 1. 本地协议能力探测与兼容回退

安装包私有 stdio shim 会分别探测 `app/installed` 与 `app/read`：

- 后端原生支持时完全透传；
- SpineCodex 0.2.2 返回不支持时，只回退一次并缓存能力结果；
- 通过分页 `app/list` 构造 Desktop 期望的 installed 状态与应用元数据；
- 合并并发目录加载，限制每线程缓存数量并正确处理真实目录更新；
- 吸收新鲜目录触发的 `forceRefresh` 反馈；
- 内部探测 ID 不会进入 Desktop。

### 2. 让交替目录快照有限收敛

部分 2,624 项目录快照只在 `pluginDisplayNames` 补全状态上交替变化。
传输层现在保留真实目录身份，首次快照和每项新补全仍会正常转发，之后的
退化与重复版本会被抑制；App 的真实增删、启停或元数据改变仍会立即转发。

### 3. 保持原生 Overlay 不受注入

`avatar-overlay` 仍由 Codex Desktop 原生创建和运行。Spine View 只注入主
Codex 页面，Overlay 的 `executeJavaScript` 调用数经过回归测试确认为 0。
本次修复也没有增加 Renderer monkey-patch 或 Electron IPC 改写。

## 验证结果

| 验证项 | 结果 |
|---|---|
| 完整源码检查 | 33/33 Node 测试及 Renderer、SSH 测试全部通过 |
| SpineCodex 0.2.2 实机协议 | installed 4/4、read 4/4、零客户端错误、零私有 ID 泄露 |
| Codex 原生后端 | 5/5 Apps 原生透传，未进入兼容回退 |
| 大目录压力回放 | 2,624 Apps、3.218 MiB、40 次 `forceRefresh`，后端加载次数不增长 |
| 本地安装后健康采样 | Wrapper 10 秒平均 CPU 0.02%，本地协议错误增量为 0 |
| Overlay | 保持原生功能，零 Spine 注入 |

## 安装

1. 确认已安装 SpineCodex 0.2.2 或更高版本。
2. 下载与 Mac 架构匹配的 DMG：
   - Apple Silicon：`SpineCodex-App-v0.2.2.4-macos-arm64.dmg`
   - Intel：`SpineCodex-App-v0.2.2.4-macos-x64.dmg`
3. 将 **SpineCodex App** 拖入 `/Applications`。
4. 使用 **Command-Q** 完整退出 ChatGPT/Codex Desktop。
5. 从 `/Applications/SpineCodex App.app` 启动。

## 兼容性边界

- 本地兼容适配器位于安装包私有 shim 中；
- 远程 SSH 会直接运行远端主机自己的 `spine-codex`，需要远端版本自行满足
  Desktop 协议要求；
- 发布包只包含包装层和固定版本 Node.js，不包含、不下载、不安装 Codex
  Desktop 或 SpineCodex；
- macOS 包使用 ad-hoc 签名，尚未 notarize；
- Desktop 内部结构变化时，兼容性 hook 会 fail closed。
