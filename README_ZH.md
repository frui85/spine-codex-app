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
  <a href="https://github.com/izumedonabe/spine-codex-app/releases/tag/v26.901.20858"><img alt="Release v26.901.20858" src="https://img.shields.io/badge/release-v26.901.20858-6D5DFC?style=flat-square"></a>
  <img alt="macOS 14+" src="https://img.shields.io/badge/macOS-14%2B-17171B?style=flat-square&logo=apple&logoColor=white">
  <img alt="Windows 10+" src="https://img.shields.io/badge/Windows-10%2B-17171B?style=flat-square&logo=windows&logoColor=white">
  <a href="LICENSE"><img alt="Apache 2.0" src="https://img.shields.io/badge/license-Apache--2.0-17171B?style=flat-square"></a>
  <img alt="当前 macOS 源码要求 SpineCodex 0.3.3+" src="https://img.shields.io/badge/macOS源码-SpineCodex_0.3.3%2B-17171B?style=flat-square">
</p>

<p align="center">
  <a href="https://github.com/izumedonabe/spine-codex-app/releases/download/v26.901.20858/SpineCodex-App-v26.901.20858-macos-arm64.dmg"><strong>下载 Apple Silicon 版本</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/izumedonabe/spine-codex-app/releases/download/v26.901.20858/SpineCodex-App-v26.901.20858-macos-x64.dmg"><strong>下载 Intel Mac 版本</strong></a>
  &nbsp;·&nbsp;
  <a href="docs/FEATURES_ZH.md">查看全部功能</a>
</p>

<br>

![嵌入 Codex Desktop 的交互式 Spine Tree](docs/media/hero.png)

<br>

SpineCodex 已经为长时间运行的 Codex 工作提供了真实结构：有明确作用域的任务、关闭节点记忆、压缩边界，以及并发 Spawn 分支。**SpineCodex App 在不替代 Codex 使用体验的前提下，让这些结构可见、可操作。**

> **精确版本兼容：**SpineCodex App `v26.901.20858` 仅对 macOS
> ChatGPT/Codex Desktop `26.901.20858` 提供经过验证的兼容保证，并且不修改、
> 不重签官方 App。低于该版本的 Desktop 不受支持；高于该版本不保证兼容，
> 应安装与 Desktop 版本号完全相同的包装层版本。

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

Spine 控件位于 Codex 的 Model features 下方。设置按主机隔离，因此本地环境与 SSH 连接环境分别保存自己的配置。

![嵌入 Codex Model features 的 Spine 功能控件](docs/media/spine-settings.png)

## 设计目标：融入 Codex

- **固定与浮动摘要**：同一棵任务树可挂载到两种原生摘要区域。
- **遵循 Codex 的语言和外观**：支持 10 种 App 语言，以及明暗配色、排版、动效变量和减少动态效果偏好。
- **界面仍是事件驱动**：不扫描 React Fiber，也没有永久整页观察器；启动器只监护回环 CDP target 生命周期。
- **本地与远程一致**：本地 `spine-codex` 由私有适配器截获，原生 SSH 则在每台主机解析同一个便携命令名。
- **有界且可回滚**：每个任务只保留最新快照，持久化有明确上限，不修改 `app.asar`，也不重签官方 App。

完整缓存限制、渲染约定、导航行为和性能设计见[功能详情](docs/FEATURES_ZH.md)。

## 安装

### 1. 安装两个上游依赖

- macOS 14 或更高版本，或者 Windows 10 build 17763 或更高版本
- 当前版本的[包含 Codex 的 ChatGPT Desktop](https://chatgpt.com/download/)
- 当前 macOS App 使用 SpineCodex 0.3.3 或更高版本：

```sh
npm install -g @spinejit/spine-codex@latest
spine-codex --version
```

### 2. 在 macOS 上安装 SpineCodex App

下载与 Mac 架构匹配的 DMG，将 **SpineCodex App** 拖入 Applications，使用 **Command-Q** 完整退出 ChatGPT，然后打开 SpineCodex App。

| Mac | 下载 |
|---|---|
| Apple Silicon | [SpineCodex-App-v26.901.20858-macos-arm64.dmg](https://github.com/izumedonabe/spine-codex-app/releases/download/v26.901.20858/SpineCodex-App-v26.901.20858-macos-arm64.dmg) |
| Intel | [SpineCodex-App-v26.901.20858-macos-x64.dmg](https://github.com/izumedonabe/spine-codex-app/releases/download/v26.901.20858/SpineCodex-App-v26.901.20858-macos-x64.dmg) |

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
```

</details>

<details>
<summary><strong>包装层工作方式</strong></summary>

```text
SpineCodex App
  ├─ 启动已安装的 Codex Desktop
  ├─ 通过私有协议适配器截获本地 spine-codex
  ├─ 为原生 SSH 保留相同的便携 spine-codex 命令名
  └─ 通过回环 CDP 监护一个 Renderer 扩展
       ├─ turn/spineTree/updated
       └─ turn/spineSpawnProgress/updated
```

启动器不会修改 `app.asar`、替换 Codex React 树、在 macOS 注入 Electron 主进程，或对磁盘上的 App 打补丁。临时 `ZDOTDIR` 代理会继续执行用户自己的 zsh 启动文件，并且只为本次启动的 App 把包装层私有 `spine-codex` 适配器放在 PATH 首位。适配器再启动单独安装、未经修改的 SpineCodex，并处理已有的协议与输出兼容逻辑。原生 SSH 保留同一个便携命令名，由每台主机直接解析自己的 SpineCodex，不需要安装远端 adapter。

启动器会与 App 同时常驻，并对精确的 `app://-/index.html` target 保持仅限回环地址的 CDP 会话。它为新文档注册 Renderer、执行带 revision guard 的首次注入，在 load 事件后恢复，并在 Electron 替换 target 后重新附着。Windows 目前继续保留单独的主进程 Inspector 兼容路径。

安全边界见 [SECURITY.md](SECURITY.md)，随包组件说明见[第三方声明](THIRD_PARTY_NOTICES.md)。

</details>

<details>
<summary><strong>从源码运行</strong></summary>

```sh
git clone https://github.com/izumedonabe/spine-codex-app.git
cd spine-codex-app
npm run build:statusbar
./spine-app --diagnose
./spine-app
./spine-app /path/to/workspace
```

源码运行要求 Node.js 22 或更高版本。不传路径时会打开现有 Codex 界面，不会创建以 `/` 为根目录的任务。请让启动器与 ChatGPT 一起运行；其回环 CDP 监护器会在 Electron 重载或替换 Renderer 后恢复 Spine View，并在 App 关闭后退出。

</details>

<details>
<summary><strong>构建、版本与兼容性</strong></summary>

发布版本号必须与唯一保证兼容的 Codex Desktop 版本号完全一致。本次版本为 **v26.901.20858**，对应 Desktop **26.901.20858**。低于该版本不受支持；高于该版本未经验证且不保证兼容。SpineCodex 0.3.3 或更高版本仍是独立的外部依赖，本仓库不会重新分发它。

推送匹配的 `v*` tag 会启动仓库内 GitHub Actions 发布流水线。工作流先校验 tag 与 `package.json#spineAppVersion`，运行完整检查，构建并验证两个 macOS DMG，上传不可变工作流资产，最后才发布 GitHub Release。Release 会先创建为草稿，避免上传失败时暴露不完整版本。Windows 工作流代码已保留，但有意禁用。

当前 macOS 外部 adapter/CDP 版本只在 ChatGPT/Codex Desktop `26.901.20858` 上提供经过验证的兼容保证。历史包装层曾在更早的 Desktop 版本上测试，但本次发布不再声明兼容。Windows Store 发现与依赖预检已在真实 Windows 环境验证；其主进程 Inspector 路径仍等待更多真机测试，因此暂未作为受支持的 GitHub Release 资产。

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

## Desktop 26.901.51231 模式管理提案

新增 macOS 原生状态栏，显示实际模式、Desktop/CLI 版本、适配基线和连接状态。默认保留官方的外部 adapter 架构；`--mode clone` 主动启用私有重签副本及主进程 hook，`--mode auto` 主动启用副本优先、外部兜底。切换会正常退出并重启本次 Desktop，新模式就绪后保存偏好，失败尝试恢复。外部模式不包含副本模式的回放/memory 恢复及 SSH bootstrap 增强。

官方 SpineCodex `0.3.3 → Codex CLI 0.147.0`，补充支持 xiurui-pan fork `0.4.1 → 0.153.4`，官方更新后继续回归。可执行 `npm run regress:cli -- /path/to/spine-codex` 检查版本及协议。实测范围与限制见[提案发布说明](docs/RELEASE_NOTES_v26.901.51231_ZH.md)。该功能与版本元数据属于贡献提案，并非上游已经发布的新版本。
