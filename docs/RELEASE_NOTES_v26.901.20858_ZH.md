# SpineCodex App v26.901.20858 中文发布说明

[English release notes](https://github.com/izumedonabe/spine-codex-app/blob/v26.901.20858/docs/RELEASE_NOTES_v26.901.20858.md)

> 发布日期：2026-09-05
>
> 保证兼容的 Desktop 版本：ChatGPT/Codex Desktop `26.901.20858`
>
> SpineCodex 要求：`0.3.3` 或更高版本
>
> 发布资产：macOS Apple Silicon 与 Intel DMG

## 兼容性约定

从本版本开始，SpineCodex App 的发布版本号使用其实际适配并验证过的 Codex
Desktop 版本号。

| 已安装的 ChatGPT/Codex Desktop | 兼容状态 |
|---|---|
| `< 26.901.20858` | 本版本不提供支持 |
| `= 26.901.20858` | 已测试并保证兼容 |
| `> 26.901.20858` | 未经验证，不保证兼容 |

应安装与本机 Desktop 版本号完全相同的 SpineCodex App。该约定不会把未经
测试的 Electron、Desktop bundle、协议或 Renderer 变化误报为兼容。

## 为什么需要本次发布

旧版包装层通过 Electron 允许的 `NODE_OPTIONS=--require` 在进程启动时把
兼容 hook 加载进 Codex Desktop 主进程内存；它没有修改磁盘上的官方 App。
Codex Desktop `26.901.20858` 所使用的 Electron 构建关闭了
`NODE_OPTIONS` 与 Node Inspector fuse，因而彻底移除了这条 Node 主进程
注入入口。现有 hook 的逻辑仍可识别新版 bundle，但已经没有受支持的通道
把它送入主进程。

本版本因此不尝试绕过 Electron 安全边界，也不修改或重签官方 App，而是把
兼容边界迁移到外部 CLI adapter，并通过仅限回环地址的常驻 CDP supervisor
恢复 Renderer 功能。这是本次架构改造和版本重新对齐的直接原因。

## 本次变化

- 恢复对 Desktop `26.901.20858` 的支持。其 Electron 构建关闭了旧版包装层
  使用的 `NODE_OPTIONS` 与 Node Inspector 主进程注入入口。
- 改用 Desktop 正式支持的 `CODEX_CLI_PATH=spine-codex` 边界。macOS 上，
  临时登录 shell 环境让本机命令解析到私有 adapter，再由 adapter 启动独立
  安装且未经修改的 SpineCodex。
- SSH 仍由每台远端主机自行解析 `spine-codex`；不安装远端 adapter，也不会
  把本机绝对路径发送到远端。
- 新增仅限回环地址的常驻 CDP supervisor，只连接精确的主
  `app://-/index.html` target，并在页面 reload 或 Renderer target 被替换后
  恢复 Spine View。
- 保留本地 app-server 协议适配、输出过滤和临时禁用 `image_generation` 的
  行为，同时不修改 SpineCodex 本体。

## 要求与边界

- macOS 14 或更高版本。
- 只有 ChatGPT/Codex Desktop `26.901.20858` 获得兼容保证。
- 本机及每台 SSH 主机安装 SpineCodex `0.3.3` 或更高版本，并确保对应登录
  shell 的 `PATH` 能找到它。
- 启动 SpineCodex App 前必须完整退出 ChatGPT；正在运行的进程无法事后加入
  CLI 环境和 CDP 端口。

DMG 只包含本包装层和经过校验和固定的 Node.js 运行时，不包含、下载、修改
或重签 ChatGPT/Codex Desktop 与 SpineCodex。Windows 发布自动化仍处于禁用
状态，本版本不提供 Windows 发布资产。

## 验证

- 完整源码与发布边界测试。
- 真实本地 app-server 通过私有 adapter 完成 initialize；SpineCodex 0.3.3
  报告上游兼容的 `codex-cli 0.147.0`。
- 在真实 Desktop `26.901.20858` 上完成 Renderer 连接及 `Page.reload` 后恢复。
- 发布构建执行严格的 ad-hoc 代码签名和 DMG 完整性检查。

本版本使用 ad-hoc 签名且尚未公证。macOS 可能要求首次通过 Finder 的
**打开**命令启动，或在**系统设置 → 隐私与安全性**中允许。两个 DMG 旁会
同时发布 SHA-256 文件。
