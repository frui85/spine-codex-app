# 功能详情

> **简体中文** · [English](FEATURES.md)

本文记录 SpineCodex App v0.3.3.5 的 Renderer、SSH、缓存、交互和性能行为。安装方式与发布边界见仓库[中文 README](../README_ZH.md)。

本包装层使用现有的 `spine-codex` 二进制启动 Codex Desktop，并在 Codex 原生摘要面板中加入一个小型 Spine Tree 区域。它不会修改 `app.asar`、安装 Codex++、重新构建 SpineCodex，也不会留下守护进程。

作为当前 `image_gen.imagegen` 不兼容问题的临时规避措施，App 后端会使用 `--disable image_generation` 启动现有 SpineCodex 二进制。它不会修改 provider、App 安装、会话数据库或 SpineCodex 安装。

环境要求：macOS 14+ 或 Windows 10 build 17763+、Node.js 22 或更高版本、Codex Desktop，以及位于 `PATH` 中的 `spine-codex`。

```sh
node spine-app.mjs --diagnose
node spine-app.mjs --diagnose --json
node spine-app.mjs /path/to/workspace
```

JSON 诊断使用带版本的固定结构，分别输出 App 版本、SpineCodex 产品版本、
Codex 兼容身份、Apps 协议模式、Desktop 版本与 bundle 契约、Renderer
SHA-256 和远端最低要求。无法解析 npm 产品包时，产品版本为 `null`，但仍会
结合兼容身份与真实协议探测判断该二进制是否可用。

启动前必须完整退出 Codex Desktop。包装层使用随机的、仅限回环地址的 CDP 端口，验证 Renderer WebSocket，为初始目标注册 Renderer，完成区域注入后退出。启动器会给已验证的主进程 hook 20 秒完成初始化；识别到中间状态确实推进时，可把当前 deadline 滑动延长 10 秒，但 30 秒总硬上限会避免启动无限等待。在 deadline 边界和最后 500 ms grace window 都会重新读取一次状态，避免刚完成的 hook 被误报失败。若最终仍超时，提示会区分 preload 从未报告与 hook 已加载但异步集成尚未完成。经过验证的 Electron main hook 会独立保留窄范围的 `web-contents-created` 和 `did-finish-load` 监听器。它先对 `spine-view.js` 做 SHA-256 校验，然后在每次主区域加载完成时重新读取同一绝对资源路径。当前源码只会在精确的 `app://-/index.html` 区域执行，因此 Renderer 崩溃、重新加载或 BrowserWindow 替换都不会恢复过期的内存内 revision，也不需要启动器守护。完整 App 进程重启仍必须再次通过包装层启动。

在 Windows 上，便携包会根据稳定的 `OpenAI.ChatGPT-Desktop_2p2nqsd0c76g0` package family 和 AppX manifest 定位已安装的 Electron 可执行文件，不依赖本地化的开始菜单显示名称。原生 GUI 启动器直接启动该文件，使限定作用域的 `CODEX_CLI_PATH`、`NODE_OPTIONS` 和回环 CDP 参数进入新进程。第二个原生可执行文件把 Codex 后端启动适配到外部安装的 npm `spine-codex.cmd`。这两个文件都是由本仓库构建的轻量 shim，不包含 SpineCodex。Windows 包必须保持目录完整，因为私有 Node 运行时和包装层文件都按相对启动器的路径解析。

AppX 可执行文件可能只是打包启动器，而不是携带 fuse wire 的 Electron 二进制；当前 Store 构建也可能忽略 `NODE_OPTIONS`。因此 Windows 使用独立的预入口路径：启动器提供一个新的、仅限回环地址的 `--inspect-brk` 端口，通过 Node Inspector 协议在暂停的 CommonJS frame 中加载 main hook，恢复进程后立即关闭连接。只有 hook 为两个必需的 bundle 结构写入已验证的 `ready` 握手后，才会继续注入 Renderer。已知被禁用的 Node CLI Inspector fuse 会直接导致预检失败；无法从打包启动器读取 fuse 时，以运行时注入结果作为权威判断。macOS 当前的 Desktop 构建在已签名 bundle 内同样关闭了该 fuse。此时启动器会准备一份私有的可注入克隆：用 APFS `clonefile` 把已安装 bundle 复制到 `~/Library/Application Support/SpineCodex App/inspectable-desktop/`，只把 `nodeCliInspect` 这一个 fuse 字节改回启用，去掉仅能由描述文件授权的 entitlement（`application-identifier`、`keychain-access-groups`、`application-groups`、`com.apple.developer.*`），由内向外做 hardened-runtime 的 ad-hoc 签名，并要求 `codesign --verify --deep --strict` 通过后才启动。克隆以仅限回环地址的 `--inspect-brk` 端口暂停启动，并按与 Windows 相同的方式注入；已安装 bundle 变化时会重建，fuse 不再启用时不会复用，原始 `ChatGPT.app` 永不被替换。设置 `SPINE_CODEX_DISABLE_DESKTOP_CLONE=1` 可退出该路径并恢复 fail-closed 预检错误；`SPINE_CODEX_DESKTOP_CLONE_ROOT` 可改变克隆位置。

## 远程 SSH 主机

对于 Codex App SSH 连接，包装层会让 App 探测并启动远程命令 **`spine-codex`**，而不是 **`codex`**。远程发现、`--version`、app-server 启动、app-server 代理和清理始终使用同一命令名。包装层不会写入 `~/.ssh/config`，也不会把本地绝对路径发送到服务器；远程登录 shell 从自己的 `PATH` 解析 `spine-codex`。

远程 SSH 的 `CODEX_CLI_PATH` 始终保持便携命令名 `spine-codex`。本地环境中，经过验证的 Electron hook 通过独立的 `SPINE_CODEX_LOCAL_CLI_PATH` 绝对路径，把 Desktop 本地 CLI selector 指向包装层私有 shim。即使 Desktop 从登录 shell 刷新 `PATH`，这个选择仍是确定的。随后 shim 使用安装包内 Node 运行时调用发现到的 SpineCodex 二进制，使 app-server 输出过滤器始终位于本地进程链中。远程 selector 保持不变，永远不会收到本地绝对路径。

每台远程主机都需要安装 SpineCodex `0.2.2` 或更高版本，并确认以下命令能在非交互登录 shell 中工作：

```sh
ssh <host> 'command -v spine-codex && spine-codex --version'
```

SpineCodex 0.3.3 通过 `@spinejit/spine-codex/package.json` 报告产品版本，并通过 `--version` 报告 `codex-cli 0.147.0`。启动器把两者分别记录为产品身份与兼容身份。一个轻量 Electron main preload 会在保留 App 原始接受规则的同时，把兼容性检查扩展到 SpineCodex `0.2.2` 或更高版本。它根据稳定的“不支持版本”错误前缀和比较器结构识别 `src-*` 版本 bundle，而不是依赖 `wc`、`mc` 等生成的导出名。

同一个 preload 根据稳定的二进制缺失错误文本和 selector 结构识别本地 CLI selector。它只修改共享 `src-*` bundle 中的本地 selector；遇到未知结构时，会在 Desktop 启动被报告为 ready 前 fail closed。

preload 还根据固定的 `desktop-ssh-websocket-v0.sock` marker 识别 SSH bootstrap，并只替换该 bootstrap 的生命周期片段。Codex 通常只在陈旧服务的可执行文件名与新选 CLI 一致时才结束该服务，因此之前由官方 `codex` 启动的服务可能在切换到 `spine-codex` 后继续存在，并被静默复用。

替代逻辑是按用户隔离的幂等状态机。远程 `app-server-control` 目录下的原子锁会串行处理并发重连。真实 Unix socket 连接探测结合 `/proc` 祖先链识别健康的 SpineCodex 服务，并在不中断的情况下复用。陈旧 socket 或者进程祖先链并非 SpineCodex 的健康服务会被替换。在发送 TERM 或 KILL 前，会先检查 `fuser` 返回的 PID 是否属于当前登录 UID，即使 SSH 账户拥有高权限也不例外。后备逻辑将 `pgrep -U "$(id -u)"` 与行首锚定的可执行文件模式组合，避免只包含 payload 文本的 shell 被误匹配。普通 Codex CLI 会话、显式 listen 地址和其他用户的进程都不在目标范围内。

启动后，bootstrap 会保留进程 PID，并要求连续两次 socket 连接成功才向 Codex Desktop 返回成功。进程过早退出或就绪超时会返回远程 app-server 日志，而不是让代理稍后以不透明的 `socket hang up` 失败。

preload 只在 Electron 浏览器主线程中运行。main chunk 和版本 chunk 可以按任意顺序加载，因此两个目标都按内容独立识别；worker、Renderer 和 utility 进程不会被修改。两项补丁验证完成后，loader hook 会被移除，一次性状态握手允许启动器继续。Renderer 恢复事件监听器会继续存在，但只在主 `app://-/index.html` 区域完成加载时工作，不执行轮询。未知结构、Renderer 恢复注册缺失或 Renderer hash 不匹配都会以明确启动错误 fail closed。不会修改任何 `app.asar` 文件或 App 签名。

在 macOS 上，诊断还会只读访问已安装 `app.asar` 的索引，不提取或修改文件。SSH 主进程 bundle、版本检查和本地 CLI selector 都必须各自唯一匹配，且后两者必须位于运行时 hook 使用的同一 `src-*` bundle。结果会列出 Desktop 版本和候选文件名。Windows Store 包激活可能让启动器无法直接看到实际 Electron 归档，因此 Windows 继续使用等价的运行时 Inspector 握手。

兼容性门禁会分别解析 SpineCodex 产品包与 `--version` 输出。原生连接卡片仍可能显示类似 `0.147.0` 的上游 core/app-server 版本，因为该值来自已连接 app-server 的 initialize 握手，而不是 CLI 产品版本探测。这不代表远程可执行文件是官方 Codex；实际 SSH 命令和进程身份才是判断后端的权威依据。

本地 shim 会依次探测 `app/installed` 和 `app/read`。SpineCodex 0.3.3 走原生路径；明确拒绝任一方法的旧后端会使用保留的分页 `app/list` 兼容适配器；其他错误会报告不可用，不会被静默转换。诊断分别将三种模式标记为 `native`、`legacy-fallback` 和 `unavailable`。

如果远程主机没有 `spine-codex`，App 原生的 CLI 缺失页面仍会调用官方 Codex 安装器。不要为本包装层使用该安装器；请在远程主机安装 SpineCodex 后重新连接。由于 SSH 命令选择和最低版本检查位于 Electron 主进程中，该功能要求完整退出 App，并通过 `spine-app.mjs` 重新启动；仅对 Renderer 热注入无法启用。

Spine Tree 是 Codex 摘要卡片的第一个区域。窗口变窄时，它会遵循 Codex 自己的响应式行为：点击右上角工具栏中的原生 **Toggle summary** 按钮显示卡片。当工作区边栏占据右侧时，Codex 会把卡片从固定面板切换为浮动 Radix popover。包装层能识别两种原生区域：优先使用 Codex 的结构化 summary 属性，同时支持旧的 marker-owned content 和新的 marker sibling，并在原生 summary marker 周围使用有界的重叠/区域布局探测作为后备。它会在浏览器绘制前把同一个 Spine Tree 实例移动到目标位置，不会复制任务树，不依赖翻译后的按钮文本或生成 class 名，也不会假设窄窗口中 300 px 的浮动卡片必须从右半边开始。点击顶部工具栏布局控件时，只在 Codex 创建或切换浮动区域的三秒有界窗口内启用观察器；任务树挂载后立即断开，绝不会成为永久整页观察器。点击 Spine Tree 标题只折叠或展开该区域。

## 语言

Spine View 通过原生 Renderer bridge 读取 Codex 结构化的 `localeOverride` 设置。这与 **Settings → General → Language** 修改的是同一个值，也是运行时权威来源；Chromium 的 `navigator.language` 和经常过期的 `html[lang]` 属性不会被视为明确的 Codex 语言选择。当 Codex 设为自动检测语言时使用 `navigator.language`，仅把 `html[lang]` 保留为旧构建的后备方案。

切换 App 语言后，任务树、tooltip、节点和 Spawn 详情、时长与 token 格式、无障碍标签以及 Spine 设置区域都会立即重新渲染。快照缓存只保存结构化 Spine 数据，因此不会把翻译后的 UI 文本持久化到会话中。

内置语言目录包含英文、简体中文、繁体中文、日文、韩文、德文、法文、西班牙文、巴西葡萄牙文和俄文。地区变体会解析到对应语言目录（当前 `pt-PT` 使用葡萄牙语目录）；其他 Codex locale 回退到英文。在 Codex 设置中修改 locale 时，包装层会从 Codex 自身设置请求的结构化完成事件中检测变化，随后精确读取一次 `localeOverride`。标准 `languagechange` 事件和对 `document.documentElement` 的单个属性观察器，仍作为自动模式兼容后备；没有语言轮询或整页观察器。所有数量、紧凑 token 计数、时钟时间、时长和复数形式都使用匹配的 `Intl` locale。

## 动效

Spine 控件复用 Codex 自带的动效常量，不定义独立动画风格。摘要和嵌套树展开使用 Codex 原生 300 ms 进入曲线（`--transition-duration-relaxed` 与 `--cubic-enter`），同步协调高度、透明度、间距和行位置变化。展开箭头使用 App 默认 150 ms 过渡，可点击行与详情操作使用 Codex 控件相同的 150 ms 按压反馈和 `0.98` active scale。快速重复点击会取消并替换前一次投影动画，不会留下固定高度或残影行。启用 `prefers-reduced-motion: reduce` 时，展开和按压动画会被禁用，所有状态变化仍立即生效。

Root Epoch 是上下文压缩边界，不是任务层级，因此当前 Root Epoch 与紧凑 CLI Renderer 一样保持隐藏。当前任务直接显示在树中。发生一次或多次原生上下文压缩后，更早的 epoch 会压缩成一行低干扰的 **Earlier context · N compactions**，可按需展开查看。该行内部的每个压缩边界都是独立可折叠的 **Before compaction N** 分组。历史任务仍附着在其之前的压缩边界上，同时不会给主任务树增加显眼的“Context epoch 1…N”编号层级。

每一行任务都可交互。点击任务，或聚焦后按 Enter/Space，会打开 Codex 全高工作区边栏，也就是 Terminal、Browser、Files、Review 和 Side tasks 共用的面板。详情会作为原生风格的 `Spine · <node>` tab 出现在同一个原生 tab 行。现有 Terminal、Browser、Side task 等 tab 都保留在该行，不会被覆盖或挤到第二组页面。选择原生 tab 会暂时隐藏 Spine 详情但不丢弃它；重新选择 Spine tab 会返回同一节点。包装层绝不会隐藏、替换或重新挂载 summary card。工作区边栏打开时，Codex 可能暂时把 summary card 从布局中移除，这是其正常响应式行为。关闭 Spine tab 或按 Escape 会恢复之前的工作区边栏内容；如果面板由包装层代用户打开，关闭时也会收起面板并返回摘要。

包装层只选择 Codex 右侧工作区 tab controller，因此底部已打开的 Terminal 面板不会意外接收 Spine 详情。详情覆盖右侧工作区面板，但不修改官方摘要或原生面板 DOM，所以关闭时不需要 DOM 恢复过程。切换会话期间，即将退出的右侧面板可能继续在 DOM 中停留几帧，同时已有一部分位于视口外。包装层会等待官方右侧面板拥有完整独立宽度、不透明、位于视口内并连续两帧稳定后，再挂载新详情。如果 Codex 把狭窄、半透明的 preview 停在部分视口外，包装层会先确认其几何位置连续数帧稳定，然后通过 Codex 自己的工具栏控件重新打开面板。有限次数重试会处理丢失的 transition，不要求用户再次点击节点。这样可以避免新会话详情以模糊、裁切的副本覆盖 summary card。

打开详情不会给 summary 行添加持久选择背景。运行状态和选择状态继续通过状态图标、排版和展开提示显示；只有 hover 和键盘 focus 使用临时表面高亮。

详情会显示节点状态、上下文位置、分支路径、任务摘要、关闭记忆、事件范围，以及 SpineCodex 可测量时自节点打开以来的大致输入 token 增长。页面还提供复制节点 ID 和关闭记忆的操作。实时 Spawn 任务行在同一个工作区边栏中显示子 thread 和 agent path 元数据。包装层会立即通过 `thread/name/set` 重命名每个原生 Codex 子 Agent，使用 Spine Tree 中相同的任务摘要，而不是 Codex 生成的 `Spawn call… <ordinal>` 标识。

**Open subagent** 使用 Codex 自己的 summary panel 按钮切换到准确的子 Agent 界面，不会构造或猜测内部路由。运行中的行无需等待仅在完成后出现的 `<time>` 元素，因此在子任务仍处于启动或工作状态时打开它，不会停留在 Codex 聚合 Subagents 页面。一次性导航最多等待五秒，直到出现准确的结构化子任务行；失败时返回父 thread，而不是把聚合页面留在前台。发现过程不依赖 locale：包装层通过结构化 `data-slot` 约定找到原生分组，并使用从 `callId` 提取的字母数字 transaction 片段与数字 ordinal 标识子任务。中文或英文标签从不作为导航 key。

Renderer 还会消费精确 `spine.spawn` 函数调用的结构化 `rawResponseItem/completed` 事件。此时会同步持久化父 thread ID、call ID、ordinal 和任务摘要，早于实时 Spawn 进度或稳定的 tree receipt。不会保存 prompt 和子任务输出。这个有界、30 天有效的缓存，使父任务中断或 App 重启后仍能恢复原生子 Agent 名称；后续进度会向同一记录补充 child thread 和 agent path 元数据。

相同的结构化身份还会把 Codex 独立生成的 `Spawn call… <ordinal>` 子详情标题映射回 Spine 任务摘要。因此原生列表行和子详情标题都会显示类似 **Calculate and verify the first 40 Fibonacci terms** 的名称。当 Codex 原生 Subagents 总览可见时，只在结构化的 `thread-summary-panel-item-group` 内容根节点上挂载 MutationObserver。如果 React 替换或重新渲染某一行，会在同一 mutation checkpoint 恢复任务摘要；离开总览后观察器断开，绝不会观察整页。标题同步则在 Codex 处理已知 Spawn 行点击前，于 capture phase 单独启用。短生命周期 Renderer root 观察器会在下一次浏览器绘制前改写标题，匹配后 900 ms 断开，最迟五秒硬超时。向已打开的子任务视图注入时，使用同一结构化映射作为后备。两条路径都不轮询。

Spawn 状态会归一化为 **Starting**、**Working**、**Completed**、**Interrupted** 或 **Failed**，遵循 Codex 自身的 `pendingInit → waiting` 和 `running → working` 分组。由于 Spine 进度协议没有服务器时间戳，包装层会记录本地观察到 working 与终态事件的时间，并把结果标记为 **Observed runtime**。这是执行时长，不同于 Codex 的“1 minute ago”等粗粒度相对时间。

Spawn transaction 结束时，call ID、ordinal、child thread ID、agent path 和观察时长会转移到对应的 Closed Spine 节点，并随现有有界快照缓存持久化，因此完成后和 App 重启后仍可执行相同操作。缺少这些元数据的旧缓存 Spawn 节点仍可根据唯一的原生结果摘要保守解析；存在歧义时绝不会打开。UI 不会把上下文增长显示成百分比。上下文位置表述为 **Current context** 或 **Before compaction N**，不会把 Root Epoch ID 暴露成面向用户的工作阶段。

折叠的 **previous branches** 行本身也是按钮：点击一次显示真实历史节点，再次点击折叠。树展开状态只保存在当前 App 会话内。拥有子节点的已完成节点还会在详情页提供 **Show subtree**，可递归检查历史分支，又不会让默认任务树过于嘈杂。**Show subtree** 会在同一帧更新 summary tree 和详情操作。折叠 previous branches bucket、**Earlier context** 或单个 **Before compaction N** 分组时，只会隐藏 summary 投影中的行；已打开的详情仍附着在底层快照节点上。只有节点真正消失、切换会话或用户主动关闭时才会关闭详情，从而避免一个会话的节点显示在另一个会话旁边。

挂载逻辑同时把 Codex summary marker 作为几何边界和结构 anchor，因此即使 marker 是空的布局障碍，或者卡片只包含 Environment 信息，也能正常工作。它会排除侧边栏区域和 subagent 面板，不依赖翻译后的区域名称。

## Spine 功能

打开 **Settings → Agent**，查看 **Model features** 正下方。包装层会添加一个原生风格的 **Spine features** 区域，目前包含 **Spine JIT**、**Spine Trim**、**Spine Spawn** 和 **Spine Tree memory projection** 开关。它不会解锁或修改 Codex 私有 Experimental features 门禁，不会向 summary card 添加控件，也不会拦截 slash command。

该区域跟随 Codex Settings 顶部选择的主机。本地主机和远程主机拥有独立的 `config.toml`：修改本地开关不会改变已连接远程主机的同名开关。Renderer 通过 `experimentalFeature/list` 读取各主机自己的功能目录，选择稳定的 `spine_jit`、`spine_trim`、`spine_spawn` 控件，以及 SpineCodex 拥有的 beta 功能（`spine_*` 或 `spinetree_*`），并通过 Codex 正常的 `config/batchWrite` 流程写入所选 `features.<name>` key。因此未来 SpineCodex beta 功能无需发布 Renderer 新版本也能出现。该区域只显示在 Agent 设置页，不执行轮询，Settings 关闭时也不发出请求。

区域标题会显示所选主机、Spawn 默认状态和 Memory Projection 状态。本地主机还会显示启动器验证过的 SpineCodex 产品版本与 Codex 兼容版本。Desktop 在当前 bootstrap 中只提供远程 host ID，因此远端版本显示“未报告”，不会复制本地诊断结论。切换主机时会先清除旧功能快照，再请求所选主机目录。

SpineCodex 会在新 thread 启动时重新加载最新配置，因此无需完整重启 App。开关有意不改变正在运行的会话，只提示变更应用于新会话。Spine JIT 启用任务树生命周期和上下文投影。Spine Trim 允许模型保守地截取或清除紧邻的大型 tool result 投影。Spine Spawn 在并行独立工作有价值时提供 `spine.spawn`，不会强制每个任务创建分支。Memory projection 会把关闭节点记忆写入该会话工作区的 `.codex/spinetree/` Markdown 文件。

包装层会继续在 Spine Tree 中可视化运行时 Spawn 进度。

Renderer 将任务树绑定到 Codex 主 thread 视图当前显示的会话。后台会话的更新会被缓存，但绝不会渲染到活动会话，因此并行任务不会争抢面板。点击会话后会立即切换到其缓存任务树；新建会话会在 Codex 解析真实 thread ID 期间清除前一棵树，而无需等待下一条 Spine 事件。

Renderer 为最近活跃的 32 个会话保留紧凑快照，同时保护当前屏幕中的会话，并在浏览器空闲时写入有界本地缓存。这样，本地和远程 SpineCodex 会话在导航或 App 重启后可以立即恢复最后收到的任务树，不必等待下一条实时 Spine 事件。带有新 sequence number 的通知会替换缓存状态。临时到真实 thread ID 的 alias 也会持久化；导航期间 Codex 重建 summary card 时，该区域会同步重新挂载。

实时快照保留所有树节点，并为每个节点最多保存 24,000 个字符的关闭记忆。2,000 节点限制只作用于持久化副本，并始终保留 active path；持久化的关闭记忆每个节点最多 2,000 个字符，在 inspector 中标记截断。总缓存仍限制为 2.5 MB，快照 30 天后过期。若要从 Renderer console 立即清除快照、缓存详情和临时 thread alias，请运行：

```js
window.__spineCodexViewV1.clearCache()
```

### Durability 会话恢复

当继承型子 Agent 恢复命中精确的 Spine durability
`sampling commit does not match its sampling-started record` 错位时，主进程
hook 可以只读重建启用 Spine 前的有效原生历史。恢复必须同时满足：存在有效
继承父任务、存在原生压缩历史、第一条 Spine 边界为 epoch 0，且父任务 Spine
记录匹配。Renderer 会恢复到替代任务并持久化旧任务 ID 到新任务 ID 的别名，
包括 `thread/status/changed` 先于 resume 响应到达的时序。其他 replay 与
durability 错误继续 fail closed。

同一条仅限 App 的恢复路径也会处理一种精确的 context-plan 错误：SpineCodex
接受了 `spine.close` 或 `spine.next` 的 memory，但投影后的 fragment 超过
8,000 UTF-8 bytes。主进程 hook 会先校验匹配的工具调用、accepted 回执、错误
报告的 fragment 大小和源会话，再克隆历史；随后只在克隆历史中按 UTF-8 边界
缩短 memory，并将恢复标记计入观测到的投影预算，最后恢复到替代任务。原始
rollout 和已安装的 SpineCodex CLI 都不会改变。边界大小、格式异常以及无关的
context-plan 错误继续 fail closed。

任务树状态和层级使用小型内联 SVG 图标与 CSS 连接线，不使用位图资源、文本字符分支或上下文百分比。footer 只报告无歧义的节点数。挂载区域处于折叠状态时，常规事件不会调度 render frame 或 DOM 更新。

Spine Tree 标题和工作区 tab 使用一个紧凑的手工标记：三个上下文节点汇入一个记忆胶囊。图标只使用 `currentColor`，无需独立图片资源即可跟随 Codex 原生明暗主题。

仓库中的 `spine-view.js` 继续作为唯一注入产物。源码按职责维护在 `renderer/` 下的有序模块中；`npm run build:renderer` 以原子方式拼接，`npm run check` 会拒绝模块与发布产物之间的任何字节漂移。

可用参数：

- `--spine-codex PATH`：选择现有 SpineCodex 二进制。
- `--app PATH`：选择 Codex/ChatGPT App bundle。
- `--diagnose`：只验证路径和版本，不启动应用。
- `--diagnose --json`：输出带版本的机器可读兼容报告。
