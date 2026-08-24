# 变更日志

> **简体中文** · [English](CHANGELOG.md)

## 尚未发布

## v0.3.2.0 - 2026-08-24

以 SpineCodex 0.3.2 为正式验证基线的兼容发布，同时保留 SpineCodex 0.2.2
最低兼容线。

- 将 SpineCodex 产品版本与 Codex 兼容身份分开记录；0.3.2 对应兼容身份
  0.147.0。
- 新增稳定 JSON 诊断，覆盖 Apps 协议能力、已安装 Desktop 身份、Renderer
  完整性和本地/远程兼容要求。
- 只读扫描已安装 macOS `app.asar`；主进程、版本检查和本地 CLI selector
  契约不能唯一匹配时 fail closed。
- 支持 SpineCodex 0.3.2 原生 `app/installed` 与 `app/read`，同时保留 0.2.2
  分页 `app/list` 适配器。
- 恢复 Settings 中 stable `spine_spawn`，保留 beta Memory Projection，并隔离
  本地与远程主机状态。
- 将生成的 0.3.2 Tree/Spawn schema 固化为契约夹具，并把 Renderer 拆成有序
  源模块，同时保持单一注入产物字节一致。
- 在独立端到端门禁完成前继续禁用图片生成，且不把 OpenAI Codex 0.149.1
  作为 SpineCodex 基线。

## v0.2.2.5 - 2026-08-14

仅包装层修订；最低支持的 SpineCodex 版本仍为 0.2.2。

- 支持 ChatGPT Desktop `26.810.41047` 引入的分组式 SSH app-server
  bootstrap 结构，包括安全目录初始化、转发 SSH Agent 准备和日志初始化。
- 在注入 SpineCodex bootstrap 前完整替换分组清理表达式，避免遗留未闭合的
  shell 子进程分组，同时继续对未知 bundle 保持失败关闭策略。

## v0.2.2.4 - 2026-08-11

仅包装层修订；最低支持的 SpineCodex 版本仍为 0.2.2。

- 为 Codex Desktop 的 `app/installed` 与 `app/read` 生命周期加入能力探测型
  app-server 协议适配器。SpineCodex 0.2.2 仅回退一次到分页 `app/list`，合并
  并发加载，按文档映射运行状态与元数据响应，并吸收新鲜目录触发的
  `forceRefresh` 反馈，避免重复未知方法错误和目录重载；未来原生支持这些
  方法的后端仍会直接透传。
- 保持原生 `avatar-overlay` 窗口不受 Spine 注入，同时在本地 app-server
  传输层对临时 `pluginDisplayNames` 补全做单调收敛处理，避免交替变化的
  数 MB 应用目录快照反复进入任一 Desktop Renderer。

## v0.2.2.3 - 2026-08-10

仅包装层修订；最低支持的 SpineCodex 版本仍为 0.2.2。

- 在本地 app-server 传输层对连续且语义相同的应用目录快照去重，阻断 SpineCodex 0.2.2 与 Codex Desktop `26.803.41515` 之间的 `app/list/updated` 反馈循环，避免重复快照进入 Desktop。
- 仅将 Desktop 的本地 CLI selector 固定到安装包私有 shim，防止登录 shell 刷新 `PATH` 后绕过输出过滤器，同时让远程 SSH 继续使用便携命令名 `spine-codex`。
- 避免反馈循环造成的多核 CPU 饱和、2,612 项应用载荷反复反序列化、Renderer 内存增长和持续热负载。
- 将 Spine View 恢复注入限制在 Codex 主区域，并排除完整的 `avatar-overlay` Renderer。
- 正常转发包括 `A → B → A` 在内的每次真实目录变化，并移除 Renderer 中仅按时间判断的突发消息保护。

## v0.2.2.2 - 2026-08-10

仅包装层修订；最低支持的 SpineCodex 版本仍为 0.2.2。

- 当当前 Codex 构建在注册 `electron/main` 前执行 Node preload 时，延后 Electron Renderer 恢复初始化；同时保持 SSH bundle 补丁同步执行，并兼容旧版 `electron` 入口。
- 在适配 Codex Desktop `26.803.41515` 引入的嵌套清理结构时，保留其转发 SSH Agent 的初始化过程。
- 让摘要挂载在旧 marker、同级 surface 和几何兼容替代区域之间自动恢复，不依赖翻译文本或生成的 CSS class。
- Electron 每次重建主区域时重新加载磁盘上的当前 Renderer 源码，防止长时间运行的主进程在崩溃后恢复过期 Renderer revision。

## v0.2.2.1 - 2026-08-07

仅包装层修订；最低支持的 SpineCodex 版本仍为 0.2.2。

- 新增 Windows x64 便携构建，包含原生 GUI 与 CLI shim 可执行文件、独立校验的 Node.js 运行时、Codex Store App 发现能力，并且不打包上游二进制。
- 根据稳定的 AppX 包标识与 manifest 查找 Windows Store ChatGPT/Codex 可执行文件，不依赖开始菜单显示名称。
- 根据稳定错误前缀与比较器结构识别并修补 app-server 版本检查，不再依赖压缩后的导出名，从而恢复 Codex Desktop 更新后的 SpineCodex SSH 兼容性。
- 在 App bundle 延迟和乱序加载时保持 Electron main hook，分别按内容识别两个 SSH 目标，并在报告启动成功前要求经过验证的启动器到主进程就绪握手。
- 本地和远程 `CODEX_CLI_PATH` 均使用便携命令名 `spine-codex`，消除 App bundle 更新后从绝对路径回退到 `codex` 的问题。
- 让远程 app-server bootstrap 幂等：串行处理并发重连，复用健康的 SpineCodex 服务，只在验证相同 UID 后替换陈旧或官方 Codex socket owner，并在启动代理前等待两次成功的 Unix socket 探测。
- 将 Electron main preload 限制在浏览器主线程，避免 worker 进程覆盖已验证的就绪状态。
- 在 Codex 执行主脚本前，通过临时且仅限回环地址的 `--inspect-brk` 会话注入 Windows 主进程 hook，绕过忽略 `NODE_OPTIONS` 的 Store 构建；恢复启动后仍要求权威就绪握手完成才允许 Renderer 注入。
- 在 Codex Renderer 崩溃或 BrowserWindow 被替换后自动恢复 Spine View：在验证过的主进程 hook 中保留两个窄范围 Electron 生命周期监听器，对 Renderer 源码做 SHA-256 校验，并且只注入 `app://-/index.html`，无需轮询或守护进程。
- 适配 Codex Desktop 嵌套的右侧面板 tab strip，恢复 Spine 详情点击，并避免 App 布局更新后详情挂载无限重试。
- 新增 tag 驱动的 GitHub Actions 发布流水线：校验源码版本，构建并验证两种 macOS 架构，并在全部资产就绪后发布；Windows 工作流代码仍保持禁用。

## v0.2.2 - 2026-08-03

跟踪 SpineCodex v0.2.2，并将最低支持版本提升到 SpineCodex 0.2.2。

- 在实时进度开始前持久化结构化 Spine Spawn 任务名称，使原生子 Agent 列表和标题名称在父任务中断或 App 重启后仍可保留。
- 根据内部 CLI selector 结构识别 Codex Electron SSH 入口，不再假定旧的 `main--HASH.js` 文件名，从而恢复在生成 `main-HASH.js` 的新版 App 中启动远程 SpineCodex。

## v0.2.1 - 2026-07-31

首个公开版本，跟踪 SpineCodex v0.2.1。

- 使用已安装的 SpineCodex 后端启动已安装的 Codex Desktop。
- 在原生摘要区域中加入嵌入式、可交互、支持本地化的 Spine Tree。
- 加入 Spine 功能开关和 Spawn 子 Agent 导航。
- 本地及已连接的 SSH 主机 app-server 均使用 SpineCodex。
- 提供独立的 macOS arm64 和 x64 DMG，只包含本包装层及其 Node 运行时。
- 自动发现 Codex Desktop 与 SpineCodex；不会打包或安装这两个依赖。
- 在 App 内多次切换语言时，跟随 Codex 运行时的 `localeOverride` 设置。
