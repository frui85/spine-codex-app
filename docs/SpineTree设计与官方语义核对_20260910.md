# Spine Tree 设计与官方语义核对

核对日期：2026-09-10。

## 结论

**原有节点、状态、图标映射与官方保持一致；本地新版的布局和历史折叠行为已经扩展，README 截图尚未同步，不能称为完全相同的界面。**

核对对象：

- 用户指定的 `frui85/spine-codex-app/main/README_ZH.md`，本次获取的远端提交为 `1f3c8b0`。
- 官方 App `izumedonabe/SpineCodexApp` 当前远端 `main`，提交 `0a6a3a1`。
- 本地 Renderer revision 14，包含限宽缩进和早期记录折叠，位于 `fix/deep-tree-layout` 工作区，分析时尚未提交或推送这两项 UI 修改；后续整合版本为 `26.901.51231.1`。
- 已安装 App 的 `spine-view.js` 与本地文件 SHA-256 相同：`9370e3d6d262940ad40bb4fce32b2804ad991f666c21ea70b7a42a5cc0e966ee`。正在运行的旧 Renderer 仍需重启或重新加载才会采用更新。

本次图索引覆盖检查发现部分模块未跟踪或已变化，因此实质比较直接使用固定 Git 提交及本地源码。本文比较的是 App 的展示映射，不代表审计了两个 SpineCodex CLI 的全部内部实现。

## 一、README 图片是不是当前设计

逐字节核对发现：`hero.png`、`spine-detail.png`、`spine-subagents.png`、`spine-settings.png`、`spine-demo.gif` 在用户仓库与官方仓库完全相同，没有重新制作。

- `hero.png` 的宣传版本仍写着 **v0.2.1**。
- 旧截图强调 `Earlier context → Before compaction N → task`，反映真实压缩边界。
- 当前新增的“展开早期记录”“最近 20 条”“第 N 层”、42px/18% 的缩进上限和两行标题，在这些旧图片中都没有展示。
- 详情仍依托 Codex 原有工作区边栏；Subagents 跳转和主机隔离设置仍沿用原来的功能方向。不同数据与主题会让截图看起来不同，不能据此认定图标语义变化。
- 旧图大部分是已压缩历史，因此呈现灰色历史/层叠图标。本地测试使用大量 `closed` 节点，所以显示绿色完成图标；这来自输入状态不同，不是图标被替换。

依据：[README 引用图片](../README_ZH.md#L32)、[官方 README](https://github.com/izumedonabe/SpineCodexApp/blob/0a6a3a1/README_ZH.md)、[原始主图](media/hero.png)。

## 二、先区分三种不同的“节点”

### 1. CLI 协议中的真实节点

现有官方 0.3.3 schema 定义的 `SpineTreeNodeKind` 只有：

| 类型 | 意义 | 当前处理 |
|---|---|---|
| `root_epoch` | 上下文阶段的根，承载压缩阶段边界 | 当前阶段的根通常不单独占一行；历史阶段通过压缩分组展示 |
| `task` | 有作用域的 Spine 任务节点 | 使用摘要、父子关系、状态等信息投影成任务行 |

状态枚举为 `live`、`opened`、`closed`、`compacted`。`spawnOutcome` 属于额外结果字段，不应和节点 `status` 混为一谈。

本地没有重新定义这些类型，仍保留来自协议的 `nodeId`、`parentId`、`kind`、`status`、`start/end` 等字段。本次折叠不写回 CLI，不改变任务状态，不删除历史，也不触发上下文压缩或直接节省模型 token。

依据：[协议枚举](../test/fixtures/spine-codex-0.3.3/SpineTreeUpdatedNotification.json#L128)、[数据归一化](../renderer/10-protocol-cache.jsfrag#L178)。

### 2. 展示分组

`bucket`、`context-history`、`context-epoch` 和新增 `recent-history` 是 UI 投影中的行，不是新增的 CLI 节点类型。

### 3. Spawn 进度行

`spawn` 行来自 Spawn 进度通知。它展示子任务的执行状态，可在最终关闭节点中关联保留子线程信息。不能把所有分支形图标都解释为“正在运行的子 Agent”。

## 三、图标和状态映射：与官方逐字一致

本次直接提取并比较官方与本地源码，以下部分全部逐字一致：

`ICONS`、`SPINE_LOGO_MARKUP`、`nodeVisual()`、`nodeLabel()`、`spawnVisual()`、`spawnStatusLabel()`、`siblingItems()`、`activePath()`。

### 任务节点图标

以下顺序也是状态判断优先级：

| 条件 | 图标 | 含义与注意事项 |
|---|---|---|
| 当前活跃节点，或 `status=live` | 圆环内圆点，活动色 | 当前执行节点；不是“完成” |
| `spawnOutcome=errored` | 圆圈叉号，错误色 | 执行结果报错 |
| `spawnOutcome=aborted` | 圆圈感叹号，警告色 | 执行被终止 |
| `spawnOutcome=completed` 或 `status=closed` | 圆圈勾号，完成色 | 节点已完成/关闭；单凭勾号不能推导“所有测试通过”或“业务结果正确” |
| `status=compacted` | 回转时钟形历史图标，弱化色 | 节点已压缩；和“仅被 UI 折叠”不同 |
| 其余状态且有子节点 | 分支连接图标，弱化色 | 树结构中具有子节点；不必然是 Spawn |
| 其余情况 | 空心圆，弱化色 | 未命中上述状态的节点，不强加新的“成功/失败”解释 |

状态色取自 Codex token，并有原有回退色；图标 SVG 的路径也未改动。`active/live` 优先于结果字段，不能只看某个孤立字段预测图标。

依据：[本地映射](../renderer/40-tree.jsfrag#L11)、[官方映射](https://github.com/izumedonabe/SpineCodexApp/blob/0a6a3a1/spine-view.js#L2030)、[本地图标](../renderer/00-runtime.jsfrag#L58)、[官方图标](https://github.com/izumedonabe/SpineCodexApp/blob/0a6a3a1/spine-view.js#L45)。

### Spawn 进度图标

| Spawn 状态 | 图标 | 标签语义 |
|---|---|---|
| `pendingInit` | 空心圆 | 正在启动 |
| `running` | 活动圆点 | 正在工作 |
| `completed` | 完成勾号 | 已完成 |
| `shutdown` | 完成勾号 | 已结束，与 completed 的文字标签不同 |
| `interrupted` | 警告感叹号 | 已中断 |
| `errored` | 错误叉号 | 失败 |
| `notFound` | 错误叉号 | 未找到 |
| 其他值 | 空心圆 | 未知/后备状态 |

依据：[本地 Spawn 映射](../renderer/40-tree.jsfrag#L495)、[官方 Spawn 映射](https://github.com/izumedonabe/SpineCodexApp/blob/0a6a3a1/spine-view.js#L2479)。

## 四、四种历史入口不能混为一谈

| 入口 | 来源 | 左侧图标 | 点击效果 | 是否代表真实压缩 |
|---|---|---|---|---|
| `Earlier context` / 早期上下文 | 官方已有 | 历史时钟 | 展开/收起历史上下文阶段 | 按真实 epoch 边界组织，可能附压缩次数 |
| `Before compaction N` / 第 N 次压缩前 | 官方已有 | 层叠图标 | 展开该历史阶段中的任务 | 是压缩边界分组 |
| `previous branches` / 之前的分支 | 官方已有 | 历史时钟 | 展开/收起同级较早分支 | 否，只是 UI 聚合 |
| `展开早期记录（N 条）` | 本地新增 | 复用历史时钟 | 显示当前投影中被最近记录窗口隐藏的行 | 否，只是 UI 显示窗口 |

右侧箭头表示可展开/当前展开状态；它不是执行结果。点击任务行仍打开详情，点击分组行展开分组。Spine Tree 标题只控制整个区块。详情页里的 Show subtree、复制节点 ID/记忆及 Open subagent 均保留原作用。

新增按钮使用“记录”而不是“压缩”，是为了避免把 UI 折叠误解为模型真的发生了 compaction。该图标复用符合官方已经用历史时钟表示 previous branches 的用法，但仍应配合明确文字。

依据：[同级分支规则](../renderer/40-tree.jsfrag#L66)、[投影](../renderer/40-tree.jsfrag#L91)、[最近记录窗口](../renderer/40-tree.jsfrag#L283)、[点击处理](../renderer/60-detail-dom.jsfrag#L791)。

## 五、本地新增布局的准确含义

- **缩进上限**：`min(depth × 14px, 42px, 18%)`。改变的是像素位置，`parentId` 和节点 ID 不变。
- **第 N 层**：来自展示投影 `depth + 1`，不是第 N 次执行、压缩或时间序号。官方本来就可能省略 root_epoch 和部分空摘要容器，因此不能把它直接解释为后端原始树的绝对深度。
- **两行标题**：保留规范化后的完整 label，显示时截成两行；hover title 与详情入口仍能访问内容。原来已有的摘要/缓存长度上限不因这次样式修复而取消。
- **最近 20 条**：目前准确含义是当前上下文投影序列末尾的 20 行，并保留投影中的 active/live、Spawn 和选中项。不是最近 20 轮用户对话，也不是根据全树时间戳重新排序的 20 次运行；最终可见数量可能超过 20。
- **不同分组独立**：历史压缩章节仍由原有按钮控制，不受当前上下文的最近记录窗口代替。
- **footer 节点数**：继续显示快照的总节点数，不是当前屏幕行数。隐藏行计数还可能包含 UI 聚合行，不能直接拿它与总节点数相减核账。
- **展开状态**：每个会话单独记录在当前 Renderer 会话内；不是 CLI 配置，App 重启后默认恢复简洁视图。

## 六、本地效果验证

使用生产的 `createUi`、`render`、`projectSnapshot` 和 `onTreeClick` 函数，以及真实图标 SVG，搭配人工构造的 80 层测试数据。它是隔离 Renderer 测试页，**不是正在运行的真实 Codex 会话截图**；原生详情面板、主题自动切换及真实消息流不在这次页面测试覆盖内。

1. **默认折叠：通过。** 1 个历史入口 + 第 61–80 条任务；当前第 80 条图标为 running。
2. **点击展开：通过。** 1 个收起入口 + 全部 80 条任务，共 81 行。
3. **点击收起：通过。** 恢复 21 行，首尾节点仍为 node:60 / node:79。
4. **窄面板：通过。** 请求 180/240/320/480px 面板宽度均无横向溢出，标题高度不超过 38px；页面受限时 480px 请求会被父级 max-width 压缩。在 320px 面板中，最深正文仍为 212px 宽。
5. **代码回归：通过。** 最近一次完整检查为 76 项测试，加 Renderer 和 SSH hook 检查；新增 350 层用例覆盖展开、收起、活跃节点与会话隔离。

| 默认最近 20 条 | 展开早期记录 |
|---|---|
| ![隔离 Renderer 测试：最近20条](media/ui-review-20260910/01-collapsed.png) | ![隔离 Renderer 测试：展开80条](media/ui-review-20260910/02-expanded.png) |

## 七、设计上应继续保持和改进的地方

**保持不变：** 原有图标路径、状态判断优先级、节点类型、原生详情入口、Spawn 跳转以及压缩边界的含义。

**需要同步说明：**

1. README 旧图应标注“历史版本示例”，再补新版真实 Desktop 的浅树/深树/折叠截图。测试页图片可以作为布局说明，但不能标成真实会话。
2. README 设计目标仍写“没有守护进程、轮询循环”，主图也写着 “zero polling”；外部 adapter 模式已经存在常驻 supervisor 和一秒 target 查询。这条描述不再适用于整个 App，应限定为树数据更新或副本模式内部恢复机制。
3. “最近 20 条”建议文档写成“当前上下文最近 20 条展示记录”，避免误认为完整对话轮数。当前没有面向用户的 N 值设置入口。
4. 当前一次展开会显示全部已投影历史；旧的前 300 行截断已移除，以免丢掉活跃末端。超大实时快照仍需评估分批展开或虚拟列表，不能再宣称始终最多渲染 300 行。
5. 超过缩进上限后，缩进本身不能区分所有祖先关系，需要依靠“第 N 层”和详情中的 Branch path。可后续改进路径查看，但不应篡改节点定义来让列表看起来更整齐。

本文只完成核对与解析，没有修改官方语义或替换 README 的产品截图。
