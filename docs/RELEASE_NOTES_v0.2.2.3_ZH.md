# SpineCodex App v0.2.2.3 中文修复说明

> 发布日期：2026-08-10
>
> 适用环境：macOS 14+、ChatGPT/Codex Desktop `26.803.41515`、SpineCodex `0.2.2+`
>
> 发布性质：仅更新 SpineCodex App 包装层，不包含 Codex Desktop 或 SpineCodex

## 一、问题现象

在 Codex Desktop `26.803.41515` 中通过 SpineCodex App 启动本地
SpineCodex 后，应用可能持续高负载运行，并伴随以下现象：

- `app/list/updated` 大约每秒出现一次；
- 单条应用目录消息约为 3.6 MB，包含 `1,000 + 1,000 + 612` 条分页数据；
- 连续消息规范化后内容没有差异，但仍被重复解析和渲染；
- ChatGPT 主进程与 Renderer 的 CPU 占用持续升高；
- Renderer RSS 曾由约 0.9 GB 增长到约 3.5 GB；
- 设备温度明显上升。

这不是正常的 Spine Tree 计算负载，而是应用目录事件反馈循环造成的重复大消息处理。

## 二、根因

问题由两层行为叠加产生：

1. SpineCodex 0.2.2 与新版 Desktop 之间会重复产生语义相同的
   `app/list/updated` 快照。
2. 旧包装层使用 `CODEX_CLI_PATH=spine-codex`，并依赖把私有 shim
   目录放在 `PATH` 最前面。但新版 Desktop 启动后会重新加载登录 shell
   环境并覆盖 `PATH`，导致本地 `spine-codex` 最终解析到全局安装：

```text
ChatGPT
└─ node /opt/homebrew/bin/spine-codex
   └─ SpineCodex vendor codex
```

因此，本应位于私有 shim 中的 app-server 输出过滤器被绕过。如果只在
Renderer 拦截，此时大消息已经完成传输和反序列化，无法从源头消除
CPU、内存和温度压力。

## 三、修复方案

### 1. 本地 CLI 固定走私有 shim

启动器新增并显式传递：

```text
SPINE_CODEX_LOCAL_CLI_PATH=<SpineCodex App 私有 shim 绝对路径>
SPINE_CODEX_SHIM_NODE=<安装包内 Node.js 绝对路径>
```

Electron main hook 在最新版 Desktop 的 `src-*` bundle 中按稳定错误文本和
CLI selector 结构进行窄匹配，仅让本地 CLI selector 优先读取
`SPINE_CODEX_LOCAL_CLI_PATH`。修复后的本地进程链为：

```text
ChatGPT
└─ SpineCodex App 内置 Node.js
   └─ wrapper/bin/spine-codex.mjs
      └─ /opt/homebrew/bin/spine-codex
         └─ SpineCodex vendor codex
```

这样即使 Desktop 再次刷新登录 shell 的 `PATH`，本地 app-server 仍会经过私有 shim 和输出过滤器。

### 2. 远程 SSH 保持便携命令名

远程 SSH 仍使用：

```text
CODEX_CLI_PATH=spine-codex
```

本机私有绝对路径不会发送到远程主机。每台远程主机继续通过自己的登录 shell
解析 `spine-codex`，因此本次修复不会破坏现有 SSH 启动方式。

### 3. 在传输层抑制重复应用目录

私有 shim 中的 app-server 输出过滤器会：

- 对应用目录快照进行规范化；
- 只抑制连续重复的语义相同快照；
- 正常转发每一次真实状态变化，包括 `A → B → A`；
- 对畸形消息和无关消息保持透传。

Renderer 不再按固定时间窗拦截应用目录通知，避免快速发生的真实变化被隐藏。

## 四、验证结果

| 验证项 | 结果 |
|---|---|
| 完整检查 | `npm run check`，21/21 通过 |
| 本地进程链 | 已确认经过安装包内 Node.js、私有 shim、全局 SpineCodex 和 vendor codex |
| 应用目录消息 | 两个连续 10 秒窗口内，`app/list/updated = 0` |
| 连续重复回归 | 连续 250 个相同快照只转发第一个 |
| 状态切换回归 | `A → B → A` 三个状态均正常转发 |
| 总消息速率 | 约 2.1-2.4 条/秒 |
| 系统 CPU | 约 74%-80% idle，无此前持续多核饱和 |
| Renderer RSS | 约 0.5 GB，未出现此前持续增长到 3.5 GB 的情况 |
| 热状态 | `pmset -g therm` 无 thermal/performance warning |
| 发布资产 | 标签工作流将从合并后的源码重新构建，并执行 SHA-256、`hdiutil verify` 和 ad-hoc codesign 校验 |

## 五、安装与核验

1. 确认已安装 SpineCodex `0.2.2` 或更高版本：

   ```sh
   spine-codex --version
   ```

2. 下载与 Mac 架构匹配的 DMG：

   - Apple Silicon：`SpineCodex-App-v0.2.2.3-macos-arm64.dmg`
   - Intel：`SpineCodex-App-v0.2.2.3-macos-x64.dmg`

3. 将 **SpineCodex App** 拖入 `/Applications`。
4. 使用 **Command-Q** 完整退出 ChatGPT/Codex Desktop。
5. 从 `/Applications/SpineCodex App.app` 启动，不要直接打开 ChatGPT App。

如果仍出现高负载，优先检查本地 app-server 的父进程链。若直接看到
`node /opt/homebrew/bin/spine-codex`，说明私有 shim 没有进入启动链路，应再次完整退出 Desktop 后从 SpineCodex App 启动。

## 六、回滚

本次修改不写入或修改 ChatGPT 的 `app.asar`，回滚只需要：

1. 完整退出 ChatGPT/Codex Desktop；
2. 删除或移走当前 `/Applications/SpineCodex App.app`；
3. 重新安装先前版本的 SpineCodex App；
4. 再次从 SpineCodex App 启动 Desktop。

用户配置、Codex 会话和远程 SSH 配置不需要迁移。

## 七、发布信息

- 正式版本：[`v0.2.2.3`](https://github.com/izumedonabe/SpineCodexApp/releases/tag/v0.2.2.3)
- 修复 PR：[`izumedonabe/SpineCodexApp#3`](https://github.com/izumedonabe/SpineCodexApp/pull/3)
- 合并提交：[`c23fc1c`](https://github.com/izumedonabe/SpineCodexApp/commit/c23fc1c7e0d0d30325f10c1e0e52ff1153d1fb30)

正式 Release 由标签工作流从合并后的源码构建。arm64、x64 DMG 及对应
SHA-256 文件通过校验后一次性发布，不包含 Windows 资产。

## 八、兼容性边界

- SpineCodex 最低版本仍为 `0.2.2`；
- 发布包只包含包装层和固定版本的 Node.js 运行时；
- 不包含、不下载、不安装 Codex Desktop 或 SpineCodex；
- macOS 包为 ad-hoc 签名，尚未 notarize；
- Desktop 内部 bundle 结构变化时，兼容性 hook 会 fail closed，而不是静默使用未修补的官方 Codex 后端。
