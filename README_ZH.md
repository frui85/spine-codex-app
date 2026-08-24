<p align="center">
  <img src="assets/app-icon.svg" width="88" alt="SpineCodex App 图标">
</p>

<h1 align="center">SpineCodex App</h1>

<p align="center"><strong>简体中文</strong> · <a href="README.md">English</a></p>

<p align="center">
  <strong>让 Spine 融入 Codex。</strong><br>
  为 Codex Desktop 提供像原生功能一样自然的交互式任务树。
</p>

<p align="center">
  <a href="https://github.com/izumedonabe/spine-codex-app/releases/tag/v0.3.2.0"><img alt="Release v0.3.2.0" src="https://img.shields.io/badge/release-v0.3.2.0-6D5DFC?style=flat-square"></a>
  <img alt="macOS 14+" src="https://img.shields.io/badge/macOS-14%2B-17171B?style=flat-square&logo=apple&logoColor=white">
  <img alt="Windows 10+" src="https://img.shields.io/badge/Windows-10%2B-17171B?style=flat-square&logo=windows&logoColor=white">
  <a href="LICENSE"><img alt="Apache 2.0" src="https://img.shields.io/badge/license-Apache--2.0-17171B?style=flat-square"></a>
  <img alt="推荐 SpineCodex 0.3.2" src="https://img.shields.io/badge/SpineCodex-0.3.2%20recommended-17171B?style=flat-square">
</p>

<p align="center">
  <a href="https://github.com/izumedonabe/spine-codex-app/releases/download/v0.3.2.0/SpineCodex-App-v0.3.2.0-macos-arm64.dmg"><strong>下载 Apple Silicon 版本</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/izumedonabe/spine-codex-app/releases/download/v0.3.2.0/SpineCodex-App-v0.3.2.0-macos-x64.dmg"><strong>下载 Intel Mac 版本</strong></a>
  &nbsp;·&nbsp;
  <a href="docs/FEATURES_ZH.md">查看全部功能</a>
</p>

<br>

![嵌入 Codex Desktop 的交互式 Spine Tree](docs/media/hero.png)

<br>

SpineCodex 已经为长时间运行的 Codex 工作提供了真实结构：有明确作用域的任务、关闭节点记忆、压缩边界，以及并发 Spawn 分支。**SpineCodex App 在不替代 Codex 使用体验的前提下，让这些结构可见、可操作。**

<table>
  <tr>
    <td width="33%" valign="top">
      <h3>追踪工作</h3>
      当前任务始终位于表层。更早的上下文按真实压缩边界分组，不再堆成无止境的对话记录。
    </td>
    <td width="33%" valign="top">
      <h3>检查记忆</h3>
      在 Codex 原生右侧工作区边栏中打开任意节点，查看其路径、摘要、关闭记忆、上下文增长和事件范围。
    </td>
    <td width="33%" valign="top">
      <h3>跟踪每个 Agent</h3>
      实时查看 Spine Spawn 分支，保留基于任务的 Agent 名称，并直接跳转到对应的子 Agent 历史记录。
    </td>
  </tr>
</table>

## 动态演示

![真实 Codex Desktop 会话中，Spine 压缩分组使用原生动效折叠](docs/media/spine-demo.gif)

<p align="center"><sub>真实 Codex Desktop 会话 · 英文界面 · 深色外观 · 非模拟产品界面</sub></p>

## 让细节出现在该出现的位置

点击任务后，其完整上下文会作为普通页面打开在 Codex 现有的右侧边栏中，而不是浮动的用户脚本卡片，也不会创建第二个边栏。

![Spine 节点详情页与任务树共用 Codex 原生右侧边栏](docs/media/spine-detail.png)

## Spawn 分支始终保持关联

实时 Spawn 进度会与最终关闭的 Spine 节点对齐。子 Agent 继承任务摘要作为显示名称，点击 **Open subagent** 可进入对应的 Codex 原生 Agent 历史。结构化 Spawn 意图会在进度开始前保存，因此即使父任务中断或 App 重启，任务名称仍能保留。

![Codex 原生 Subagents 页面与嵌入的 Spine Tree](docs/media/spine-subagents.png)

## 像原生功能一样配置

Spine 控件位于 Codex 的 Model features 下方。设置按主机隔离，因此本地环境与 SSH 连接环境分别保存自己的配置。标题会显示本地 SpineCodex 产品版本与 Codex 兼容版本；远程主机保持独立功能状态，不复用本地版本结论。

![嵌入 Codex Model features 的 Spine 功能控件](docs/media/spine-settings.png)

## 设计目标：融入 Codex

- **固定与浮动摘要**：同一棵任务树可挂载到两种原生摘要区域。
- **遵循 Codex 的语言和外观**：支持 10 种 App 语言，以及明暗配色、排版、动效变量和减少动态效果偏好。
- **默认事件驱动**：没有守护进程、轮询循环、React Fiber 扫描或永久的整页观察器。
- **本地与远程一致**：本地启动已安装的 SpineCodex，远程通过 Codex 原生 SSH 传输选择 `spine-codex`。
- **有界且可回滚**：每个任务只保留最新快照，持久化有明确上限，不修改 `app.asar`，窄范围 hook 在结构未知时会 fail closed。

完整缓存限制、渲染约定、导航行为和性能设计见[功能详情](docs/FEATURES_ZH.md)。

## 安装

### 1. 安装两个上游依赖

- macOS 14 或更高版本，或者 Windows 10 build 17763 或更高版本
- 当前版本的[包含 Codex 的 ChatGPT Desktop](https://chatgpt.com/download/)
- SpineCodex 0.2.2 或更高版本；推荐并正式验证 0.3.2：

```sh
npm install -g @spinejit/spine-codex@latest
spine-codex --version
```

### 2. 在 macOS 上安装 SpineCodex App

下载与 Mac 架构匹配的 DMG，将 **SpineCodex App** 拖入 Applications，使用 **Command-Q** 完整退出 ChatGPT，然后打开 SpineCodex App。

| Mac | 下载 |
|---|---|
| Apple Silicon | [SpineCodex-App-v0.3.2.0-macos-arm64.dmg](https://github.com/izumedonabe/spine-codex-app/releases/download/v0.3.2.0/SpineCodex-App-v0.3.2.0-macos-arm64.dmg) |
| Intel | [SpineCodex-App-v0.3.2.0-macos-x64.dmg](https://github.com/izumedonabe/spine-codex-app/releases/download/v0.3.2.0/SpineCodex-App-v0.3.2.0-macos-x64.dmg) |

发布包只包含本包装层及其私有 Node.js 运行时。**不会打包、下载或安装 Codex Desktop 和 SpineCodex。** 如果缺少任一依赖，内置诊断会一次性报告两项要求，并且不会修改系统。

> 首个公开构建使用 ad-hoc 签名，因为项目暂时没有 Developer ID 证书。如果 macOS 阻止首次启动，请右键点击 App 并选择**打开**，或在**系统设置 → 隐私与安全性**中允许一次。两个 DMG 旁均提供 SHA-256 文件。

### Windows x64 便携构建

Windows 版本目前在本地生成便携 ZIP。请解压完整目录后运行 **SpineCodex App.exe**；不要把可执行文件从相邻的 `runtime` 和 `wrapper` 目录中单独移走。

```sh
npm run build:windows
```

构建使用经过官方校验和验证的 Windows Node.js 运行时，以及由本仓库源码编译的两个轻量原生 x64 启动器。它不会下载或打包 Codex Desktop 或 SpineCodex。完整的 Windows Actions 定义保存在 `.github/workflows/windows-release.yml.disabled`，GitHub 不会执行该文件。启用工作流或发布受支持的 Windows 资产前，仍需完成 Windows 代码签名和更多真机启动验证。

Microsoft Store 构建可能忽略 `NODE_OPTIONS`，而其打包启动器也可能不暴露可读取的 Electron fuse。为此，Windows 包装层会在新的、仅限回环地址的 Inspector 端口上暂停 Electron，在暂停的 CommonJS frame 中加载主进程 hook，立即恢复进程并关闭 Inspector 连接。只有 hook 报告两项兼容性补丁均就绪后，才会继续注入 Renderer。如果 Inspector 注入或握手失败，包装层会拒绝在未打补丁的官方 Codex 后端上静默继续运行。

<details>
<summary><strong>自动路径发现</strong></summary>

正常情况下无需手动配置路径。

| 目标 | 发现顺序 |
|---|---|
| Codex Desktop | macOS 标准位置及 Spotlight/Launch Services；Windows 标准安装位置，以及稳定的 OpenAI AppX 包标识与 manifest 可执行文件路径 |
| 本地 SpineCodex | 显式参数、环境变量、当前/登录 shell 的 `PATH`、Homebrew/npm/Volta/nvm 路径和 Windows npm 命令 shim |
| 远程 SpineCodex | 每台 SSH 主机登录 shell 的 `PATH`；绝不会把本地可执行文件路径发送到服务器 |

开发和排障时仍可使用显式的 `--app` 与 `--spine-codex` 参数：

```sh
./spine-app --diagnose
./spine-app --diagnose --json
```

JSON 模式稳定输出 App 版本、SpineCodex 产品与 Codex 兼容身份、Apps
协议模式、Desktop bundle 契约、Renderer 校验和，以及本地/远程兼容要求。

</details>

<details>
<summary><strong>包装层工作方式</strong></summary>

```text
SpineCodex App
  ├─ 启动已安装的 Codex Desktop
  ├─ 让本地 app-server 通过已安装的 spine-codex 启动
  ├─ 为 Codex 原生 SSH 启动路径选择 spine-codex
  └─ 注入并恢复一个事件驱动的 Renderer 扩展
       ├─ turn/spineTree/updated
       └─ turn/spineSpawnProgress/updated
```

启动器不会修改 `app.asar`、替换 Codex React 树或对磁盘上的应用打补丁。Renderer 集成使用 Shadow DOM 和窄范围结构 hook。本地启动使用指向包装层私有 shim 的专用绝对路径，因此 Desktop 刷新登录 shell 环境时无法绕过输出过滤器。远程 SSH 保持便携命令名 `spine-codex`，由每台主机自己的登录 shell 解析。远程 bootstrap 是串行且幂等的：复用健康的 SpineCodex 服务，只替换同一用户的陈旧 socket owner 或官方 Codex owner，并在 Unix socket 可确认连接前不启动代理。一次性的启动器/主进程就绪握手会验证本地 selector、版本检查与 SSH bootstrap 结构；未知 bundle 会 fail closed。

经过验证的主进程 hook 还保留两个窄范围 Electron 生命周期监听器。它在启动时对打包的 `spine-view.js` 做 SHA-256 校验。每次主窗口完成 `did-finish-load` 时，包括 Electron Renderer 崩溃后的重新加载，hook 都会再次读取同一绝对资源路径，并且只在精确的 `app://-/index.html` 区域执行当前 Renderer。这可以防止长时间运行的主进程在安装包更新后恢复旧的内存内 Renderer 版本。整个过程没有定时器、轮询守护或额外常驻进程。Renderer 自身的 revision guard 保证首次 CDP 注入与后续恢复注入幂等。

安全边界见 [SECURITY.md](SECURITY.md)，随包组件说明见[第三方声明](THIRD_PARTY_NOTICES.md)。

</details>

<details>
<summary><strong>从源码运行</strong></summary>

```sh
git clone https://github.com/izumedonabe/spine-codex-app.git
cd spine-codex-app
./spine-app --diagnose
./spine-app
./spine-app /path/to/workspace
```

源码运行要求 Node.js 22 或更高版本。不传路径时会打开现有 Codex 界面，不会创建以 `/` 为根目录的任务。启动器在验证主进程 hook 和首次 Renderer 注入后退出；Codex Desktop 会继续运行，进程内生命周期监听器会在 Electron 替换 Renderer 时恢复 Spine View。

</details>

<details>
<summary><strong>构建、版本与兼容性</strong></summary>

本版本为 **v0.3.2.0**：前三段表示推荐的 SpineCodex 正式验证基线，第四段表示仅 App 修订。最低兼容线仍为 SpineCodex 0.2.2。产品版本、Codex 兼容身份与最低支持版本分别记录；版本跟踪不代表本仓库重新分发 SpineCodex。

推送匹配的 `v*` tag 会启动仓库内 GitHub Actions 发布流水线。工作流先校验 tag 与 `package.json#spineAppVersion`，运行完整检查，构建并验证两个 macOS DMG，上传不可变工作流资产，最后才发布 GitHub Release。Release 会先创建为草稿，避免上传失败时暴露不完整版本。Windows 工作流代码已保留，但有意禁用。

当前 bundle 契约已在 ChatGPT/Codex Desktop `26.810.41047` 与 `26.818.41509` 上验证。诊断会只读扫描已安装 macOS `app.asar`，要求主进程补丁目标唯一，并要求版本检查与 CLI selector 共同位于唯一共享 bundle；未知或歧义结构会 fail closed。Windows Store 发现与依赖预检已在真实 Windows 环境验证；主进程 Inspector 路径仍需扩大真机验证后，才会把 Windows 作为受支持的 GitHub Release 资产发布。

SpineCodex 0.3.2 同时报告产品版本 `0.3.2` 与 Codex 兼容身份 `0.147.0`，App 会分别记录两者。OpenAI Codex `0.149.1` 不属于本版本的 SpineCodex 验证基线。图片生成在完成真实生成、消息回放、Tree 更新与恢复门禁前继续禁用。机器可读兼容矩阵见 [`compatibility.json`](compatibility.json)。

```sh
npm run check
npm run build:macos
npm run build:windows
```

构建脚本会下载固定版本的官方 Node.js 运行时，使用 Node 的 SHA-256 manifest 校验，并生成按架构区分的 macOS DMG 或 Windows x64 便携 ZIP。脚本不会下载 SpineCodex 或 Codex Desktop。

</details>

## 贡献

欢迎提交 Issue 和范围明确的 Pull Request。请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，安全敏感问题请通过 [SECURITY.md](SECURITY.md) 报告。

## 许可证

Apache-2.0。参见 [LICENSE](LICENSE) 和[第三方声明](THIRD_PARTY_NOTICES.md)。

<p align="center"><sub>独立项目，与 OpenAI 无隶属关系，也未获得 OpenAI 背书。</sub></p>
