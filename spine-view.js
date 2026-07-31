(() => {
  "use strict";

  const GLOBAL_KEY = "__spineCodexViewV1";
  const TREE_METHOD = "turn/spineTree/updated";
  const SPAWN_METHOD = "turn/spineSpawnProgress/updated";
  const SPINE_FEATURE_PREFIX = /^(?:spine_|spinetree_)/;
  const SPINE_STABLE_SETTINGS_FEATURES = new Set([
    "spine_jit",
    "spine_trim",
  ]);
  const SETTINGS_SECTION_ID = "spine-codex-settings";
  const SNAPSHOT_CACHE_KEY = "spine-codex.view.snapshots.v1";
  const THREAD_ALIASES_KEY = "spine-codex.view.thread-aliases";
  const SNAPSHOT_CACHE_VERSION = 1;
  const SNAPSHOT_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;
  const MAX_PERSISTED_CACHE_CHARS = 2_500_000;
  const MAX_PERSISTED_NODE_COUNT = 2_000;
  const MAX_LIVE_MEMORY_SUMMARY_CHARS = 24_000;
  const MAX_PERSISTED_MEMORY_SUMMARY_CHARS = 2_000;
  const MAX_THREADS = 32;
  const MAX_THREAD_ALIASES = 64;
  const MAX_ROWS = 300;
  const MAX_VISIBLE_SIBLINGS = 3;
  const VERSION = "0.2.1";
  const SPINE_LOGO_MARKUP = `
    <circle cx="4" cy="4.5" r="1.15" stroke="currentColor" stroke-width="1.3"/>
    <circle cx="10" cy="3.25" r="1.15" stroke="currentColor" stroke-width="1.3"/>
    <circle cx="16" cy="4.5" r="1.15" stroke="currentColor" stroke-width="1.3"/>
    <path d="M4.9 5.2C4.9 8.1 7.2 9.2 10 10.6M10 4.4V10.6M15.1 5.2C15.1 8.1 12.8 9.2 10 10.6M10 10.6V13"
      stroke="currentColor" stroke-width="1.35" stroke-linecap="round"
      stroke-linejoin="round"/>
    <rect x="6.75" y="13" width="6.5" height="3.75" rx="1.6"
      stroke="currentColor" stroke-width="1.35"/>
    <path d="M8.75 14.9H11.25" stroke="currentColor" stroke-width="1.25"
      stroke-linecap="round"/>`;
  const ICONS = Object.freeze({
    running: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6.25"/><circle class="fill" cx="10" cy="10" r="2.25"/></svg>',
    check: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6.25"/><path d="m6.9 10.15 2.05 2.1 4.25-4.55"/></svg>',
    error: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6.25"/><path d="m7.7 7.7 4.6 4.6m0-4.6-4.6 4.6"/></svg>',
    warning: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6.25"/><path d="M10 6.7v4.1m0 2.55h.01"/></svg>',
    history: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.35 6.3H2.9V3.85M3.2 6.05A7 7 0 1 1 3.4 14"/><path d="M10 6.25v4.05l2.7 1.55"/></svg>',
    compact: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5.25 6.75 4.75-2.5 4.75 2.5-4.75 2.5-4.75-2.5Z"/><path d="m5.25 10.1 4.75 2.5 4.75-2.5M5.25 13.45l4.75 2.5 4.75-2.5"/></svg>',
    branch: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="6" cy="5" r="1.65"/><circle cx="14" cy="7.5" r="1.65"/><circle cx="14" cy="14.5" r="1.65"/><path d="M6 6.65v3.1A4.75 4.75 0 0 0 10.75 14.5h1.6M6 9.1h4.3A3.7 3.7 0 0 0 12.35 7.5"/></svg>',
    idle: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="5.5"/></svg>',
    more: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle class="fill" cx="5" cy="10" r="1.15"/><circle class="fill" cx="10" cy="10" r="1.15"/><circle class="fill" cx="15" cy="10" r="1.15"/></svg>',
  });
  const EN_MESSAGES = Object.freeze({
    "task.current": "Current task",
    "task.completed": "Completed task",
    "task.previous": "Previous task",
    "task.generic": "Task",
    "branches.hidden.one": "{count} previous branch",
    "branches.hidden.other": "{count} previous branches",
    "branches.hide.one": "Hide {count} previous branch",
    "branches.hide.other": "Hide {count} previous branches",
    "context.earlier": "Earlier context",
    "context.compactions.one": "{count} compaction",
    "context.compactions.other": "{count} compactions",
    "context.beforeCompaction": "Before compaction {count}",
    "context.nodes.one": "{count} node",
    "context.nodes.other": "{count} nodes",
    "context.additionalHidden": "Additional nodes hidden",
    "context.current": "Current context",
    "spawn.parallelTask": "Parallel task {count}",
    "spawn.title": "Spine · Spawn {count}",
    "status.running": "Running",
    "status.failed": "Failed",
    "status.aborted": "Aborted",
    "status.completed": "Completed",
    "status.compacted": "Compacted",
    "status.opened": "Opened",
    "spawnStatus.starting": "Starting",
    "spawnStatus.working": "Working",
    "spawnStatus.completed": "Completed",
    "spawnStatus.finished": "Finished",
    "spawnStatus.failed": "Failed",
    "spawnStatus.interrupted": "Interrupted",
    "spawnStatus.notFound": "Not found",
    "spawnStatus.unknown": "Unknown",
    "timing.waiting": "Waiting for {duration}",
    "timing.running": "Running for {duration}",
    "timing.ran": "Ran for {duration}",
    "timing.now": "now",
    "pressure.added": "About {context} input tokens added since this node opened{range}",
    "pressure.missingCurrent": "Current token usage is unavailable",
    "pressure.missingBaseline": "The opening token baseline is unavailable",
    "pressure.coordinateMismatch": "The token measurements use different coordinates",
    "pressure.unavailable": "Context growth is unavailable",
    "feedback.subagentNotReady": "Subagent is not ready",
    "feedback.copied": "Copied",
    "detail.children.one": "{count} child",
    "detail.children.other": "{count} children",
    "detail.branchPath": "Branch path",
    "detail.task": "Task",
    "detail.agentPath": "Agent path",
    "detail.childThread": "Child thread",
    "detail.runtime": "Observed runtime",
    "detail.memory": "Closing memory",
    "detail.memoryTruncated": "Long cached memory was truncated",
    "detail.memoryPending": "A continuation memory will appear after this node closes.",
    "detail.contextGrowth": "Context growth",
    "detail.eventRange": "Event range",
    "detail.openSubagent": "Open subagent",
    "detail.hideSubtree": "Hide subtree",
    "detail.showSubtree": "Show subtree",
    "detail.copyNodeId": "Copy node ID",
    "detail.copyChildThreadId": "Copy child thread ID",
    "detail.copyMemory": "Copy closing memory",
    "detail.close": "Close Spine detail",
    "tree.noActivity": "No Spine activity in this thread",
    "tree.waiting": "Waiting for the current thread…",
    "tree.showEarlier": "Show or hide earlier context",
    "tree.showCompaction": "Show or hide tasks from before compaction {count}",
    "tree.showBranches": "Show or hide previous branches",
    "tree.viewDetails": "View details",
    "tree.empty": "This Spine Tree is empty.",
    "tree.nodes.one": "{count} node",
    "tree.nodes.other": "{count} nodes",
    "settings.title": "Spine features",
    "settings.loading": "Loading SpineCodex settings…",
    "settings.saving": "Saving… The current conversation will not change.",
    "settings.saved": "Saved. New conversations will use this setting; the current one is unchanged.",
    "settings.unavailable": "No Spine features are available on this host. Make sure it is running the latest SpineCodex.",
    "settings.error": "Could not load SpineCodex settings.",
    "settings.retry": "Retry",
    "settings.applies": "Changes apply only to new conversations.",
    "settings.toggle": "Toggle {label}",
    "feature.spine_jit.label": "Spine JIT",
    "feature.spine_jit.description": "Enable Spine task trees, node lifecycles, and context projection.",
    "feature.spine_trim.label": "Spine Trim",
    "feature.spine_trim.description": "Let the model trim a just-produced large tool-result projection while preserving the evidence it still needs.",
    "feature.spine_spawn.label": "Spine Spawn",
    "feature.spine_spawn.description": "Run differentiated Spine branches concurrently and join their results.",
    "feature.spinetree_memory_projection.label": "Spine Tree memory projection",
    "feature.spinetree_memory_projection.description": "Project closed-node memory to Markdown files under .codex/spinetree/ in the workspace for local inspection.",
    "host.local": "Local",
  });
  const UI_MESSAGES = Object.freeze({
    en: EN_MESSAGES,
    "zh-Hans": Object.freeze({
      "task.current": "当前任务",
      "task.completed": "已完成任务",
      "task.previous": "先前任务",
      "task.generic": "任务",
      "branches.hidden.other": "{count} 个先前分支",
      "branches.hide.other": "收起 {count} 个先前分支",
      "context.earlier": "早期上下文",
      "context.compactions.other": "已压缩 {count} 次",
      "context.beforeCompaction": "第 {count} 次压缩前",
      "context.nodes.other": "{count} 个节点",
      "context.additionalHidden": "其余节点已隐藏",
      "context.current": "当前上下文",
      "spawn.parallelTask": "并行任务 {count}",
      "spawn.title": "Spine · 并行 {count}",
      "status.running": "进行中",
      "status.failed": "失败",
      "status.aborted": "已中止",
      "status.completed": "已完成",
      "status.compacted": "已压缩",
      "status.opened": "已打开",
      "spawnStatus.starting": "正在启动",
      "spawnStatus.working": "进行中",
      "spawnStatus.completed": "已完成",
      "spawnStatus.finished": "已结束",
      "spawnStatus.failed": "失败",
      "spawnStatus.interrupted": "已中断",
      "spawnStatus.notFound": "未找到",
      "spawnStatus.unknown": "未知",
      "timing.waiting": "已等待 {duration}",
      "timing.running": "已运行 {duration}",
      "timing.ran": "运行 {duration}",
      "timing.now": "当前",
      "pressure.added": "节点打开后约增加 {context} 个输入 token{range}",
      "pressure.missingCurrent": "当前 token 用量尚不可用",
      "pressure.missingBaseline": "缺少节点打开时的 token 基线",
      "pressure.coordinateMismatch": "两次 token 统计使用了不同坐标系",
      "pressure.unavailable": "上下文增量暂不可用",
      "feedback.subagentNotReady": "子代理尚未就绪",
      "feedback.copied": "已复制",
      "detail.children.other": "{count} 个子节点",
      "detail.branchPath": "分支路径",
      "detail.task": "任务",
      "detail.agentPath": "Agent 路径",
      "detail.childThread": "子对话",
      "detail.runtime": "观测运行时长",
      "detail.memory": "关闭记忆",
      "detail.memoryTruncated": "缓存中的较长记忆已截断",
      "detail.memoryPending": "节点关闭后会在这里生成供后续上下文使用的记忆。",
      "detail.contextGrowth": "上下文增量",
      "detail.eventRange": "事件范围",
      "detail.openSubagent": "打开子代理",
      "detail.hideSubtree": "收起子树",
      "detail.showSubtree": "展开子树",
      "detail.copyNodeId": "复制节点 ID",
      "detail.copyChildThreadId": "复制子对话 ID",
      "detail.copyMemory": "复制关闭记忆",
      "detail.close": "关闭 Spine 详情",
      "tree.noActivity": "当前对话暂无 Spine 活动",
      "tree.waiting": "等待当前对话就绪…",
      "tree.showEarlier": "展开或收起早期上下文",
      "tree.showCompaction": "展开或收起第 {count} 次压缩前的任务",
      "tree.showBranches": "展开或收起先前分支",
      "tree.viewDetails": "查看节点详情",
      "tree.empty": "这个 Spine Tree 为空。",
      "tree.nodes.other": "{count} 个节点",
      "settings.title": "Spine 功能",
      "settings.loading": "正在读取 SpineCodex 设置…",
      "settings.saving": "正在保存…当前对话不会改变。",
      "settings.saved": "已保存。新对话会使用此设置，当前对话保持不变。",
      "settings.unavailable": "当前主机未提供 Spine 功能。请确认该主机正在使用最新版 SpineCodex。",
      "settings.error": "无法读取 SpineCodex 设置。",
      "settings.retry": "重试",
      "settings.applies": "更改只对新对话生效。",
      "settings.toggle": "切换 {label}",
      "feature.spine_jit.label": "Spine JIT",
      "feature.spine_jit.description": "启用 Spine 任务树、节点生命周期与上下文投影机制。",
      "feature.spine_trim.label": "Spine Trim",
      "feature.spine_trim.description": "允许模型裁剪刚产生的大型工具结果投影，在保留关键证据的同时减少上下文占用。",
      "feature.spine_spawn.label": "Spine Spawn",
      "feature.spine_spawn.description": "并行运行不同的 Spine 分支并汇总结果。",
      "feature.spinetree_memory_projection.label": "Spine Tree 内存投影",
      "feature.spinetree_memory_projection.description": "将已关闭节点的记忆投影为工作区 .codex/spinetree/ 下的 Markdown 文件，供本地查看。",
      "host.local": "本机",
    }),
    "zh-Hant": Object.freeze({
      "task.current": "目前任務",
      "task.completed": "已完成任務",
      "task.previous": "先前任務",
      "task.generic": "任務",
      "branches.hidden.other": "{count} 個先前分支",
      "branches.hide.other": "收起 {count} 個先前分支",
      "context.earlier": "早期內容",
      "context.compactions.other": "已壓縮 {count} 次",
      "context.beforeCompaction": "第 {count} 次壓縮前",
      "context.nodes.other": "{count} 個節點",
      "context.additionalHidden": "其餘節點已隱藏",
      "context.current": "目前內容",
      "spawn.parallelTask": "平行任務 {count}",
      "spawn.title": "Spine · 平行 {count}",
      "status.running": "進行中",
      "status.failed": "失敗",
      "status.aborted": "已中止",
      "status.completed": "已完成",
      "status.compacted": "已壓縮",
      "status.opened": "已開啟",
      "spawnStatus.starting": "正在啟動",
      "spawnStatus.working": "進行中",
      "spawnStatus.completed": "已完成",
      "spawnStatus.finished": "已結束",
      "spawnStatus.failed": "失敗",
      "spawnStatus.interrupted": "已中斷",
      "spawnStatus.notFound": "找不到",
      "spawnStatus.unknown": "未知",
      "timing.waiting": "已等待 {duration}",
      "timing.running": "已執行 {duration}",
      "timing.ran": "執行了 {duration}",
      "timing.now": "目前",
      "pressure.added": "節點開啟後約增加 {context} 個輸入 token{range}",
      "pressure.missingCurrent": "目前 token 用量無法取得",
      "pressure.missingBaseline": "缺少節點開啟時的 token 基準",
      "pressure.coordinateMismatch": "兩次 token 統計使用了不同座標系",
      "pressure.unavailable": "內容增量無法取得",
      "feedback.subagentNotReady": "子代理尚未就緒",
      "feedback.copied": "已複製",
      "detail.children.other": "{count} 個子節點",
      "detail.branchPath": "分支路徑",
      "detail.task": "任務",
      "detail.agentPath": "Agent 路徑",
      "detail.childThread": "子對話",
      "detail.runtime": "觀測執行時間",
      "detail.memory": "關閉記憶",
      "detail.memoryTruncated": "快取中的較長記憶已截斷",
      "detail.memoryPending": "節點關閉後，這裡會產生供後續內容使用的記憶。",
      "detail.contextGrowth": "內容增量",
      "detail.eventRange": "事件範圍",
      "detail.openSubagent": "開啟子代理",
      "detail.hideSubtree": "收起子樹",
      "detail.showSubtree": "展開子樹",
      "detail.copyNodeId": "複製節點 ID",
      "detail.copyChildThreadId": "複製子對話 ID",
      "detail.copyMemory": "複製關閉記憶",
      "detail.close": "關閉 Spine 詳情",
      "tree.noActivity": "目前對話沒有 Spine 活動",
      "tree.waiting": "正在等待目前對話就緒…",
      "tree.showEarlier": "展開或收起早期內容",
      "tree.showCompaction": "展開或收起第 {count} 次壓縮前的任務",
      "tree.showBranches": "展開或收起先前分支",
      "tree.viewDetails": "檢視節點詳情",
      "tree.empty": "這個 Spine Tree 是空的。",
      "tree.nodes.other": "{count} 個節點",
      "settings.title": "Spine 功能",
      "settings.loading": "正在讀取 SpineCodex 設定…",
      "settings.saving": "正在儲存…目前對話不會變更。",
      "settings.saved": "已儲存。新對話會使用此設定，目前對話維持不變。",
      "settings.unavailable": "此主機未提供 Spine 功能。請確認該主機正在使用最新版 SpineCodex。",
      "settings.error": "無法讀取 SpineCodex 設定。",
      "settings.retry": "重試",
      "settings.applies": "變更只會套用至新對話。",
      "settings.toggle": "切換 {label}",
      "feature.spine_jit.label": "Spine JIT",
      "feature.spine_jit.description": "啟用 Spine 任務樹、節點生命週期與內容投影機制。",
      "feature.spine_trim.label": "Spine Trim",
      "feature.spine_trim.description": "允許模型裁剪剛產生的大型工具結果投影，同時保留仍需使用的關鍵證據。",
      "feature.spine_spawn.label": "Spine Spawn",
      "feature.spine_spawn.description": "平行執行不同的 Spine 分支並彙整結果。",
      "feature.spinetree_memory_projection.label": "Spine Tree 記憶投影",
      "feature.spinetree_memory_projection.description": "將已關閉節點的記憶投影為工作區 .codex/spinetree/ 下的 Markdown 檔案，供本機檢視。",
      "host.local": "本機",
    }),
    ja: Object.freeze({
      "task.current": "現在のタスク",
      "task.completed": "完了したタスク",
      "task.previous": "以前のタスク",
      "task.generic": "タスク",
      "branches.hidden.other": "以前の分岐 {count} 件",
      "branches.hide.other": "以前の分岐 {count} 件を閉じる",
      "context.earlier": "以前のコンテキスト",
      "context.compactions.other": "{count} 回圧縮済み",
      "context.beforeCompaction": "{count} 回目の圧縮前",
      "context.nodes.other": "{count} ノード",
      "context.additionalHidden": "その他のノードは非表示",
      "context.current": "現在のコンテキスト",
      "spawn.parallelTask": "並列タスク {count}",
      "spawn.title": "Spine · 並列 {count}",
      "status.running": "実行中",
      "status.failed": "失敗",
      "status.aborted": "中止",
      "status.completed": "完了",
      "status.compacted": "圧縮済み",
      "status.opened": "開いています",
      "spawnStatus.starting": "起動中",
      "spawnStatus.working": "処理中",
      "spawnStatus.completed": "完了",
      "spawnStatus.finished": "終了",
      "spawnStatus.failed": "失敗",
      "spawnStatus.interrupted": "中断",
      "spawnStatus.notFound": "見つかりません",
      "spawnStatus.unknown": "不明",
      "timing.waiting": "{duration} 待機",
      "timing.running": "{duration} 実行中",
      "timing.ran": "{duration} 実行",
      "timing.now": "現在",
      "pressure.added": "このノードを開いてから入力トークンが約 {context} 増加{range}",
      "pressure.missingCurrent": "現在のトークン使用量を取得できません",
      "pressure.missingBaseline": "ノードを開いた時点のトークン基準値がありません",
      "pressure.coordinateMismatch": "2 つのトークン測定で異なる座標系が使われています",
      "pressure.unavailable": "コンテキスト増加量を取得できません",
      "feedback.subagentNotReady": "サブエージェントの準備ができていません",
      "feedback.copied": "コピーしました",
      "detail.children.other": "子ノード {count} 件",
      "detail.branchPath": "分岐パス",
      "detail.task": "タスク",
      "detail.agentPath": "エージェントパス",
      "detail.childThread": "子スレッド",
      "detail.runtime": "観測実行時間",
      "detail.memory": "終了時メモリ",
      "detail.memoryTruncated": "キャッシュ内の長いメモリは省略されています",
      "detail.memoryPending": "このノードが閉じると、継続用メモリがここに表示されます。",
      "detail.contextGrowth": "コンテキスト増加量",
      "detail.eventRange": "イベント範囲",
      "detail.openSubagent": "サブエージェントを開く",
      "detail.hideSubtree": "サブツリーを閉じる",
      "detail.showSubtree": "サブツリーを開く",
      "detail.copyNodeId": "ノード ID をコピー",
      "detail.copyChildThreadId": "子スレッド ID をコピー",
      "detail.copyMemory": "終了時メモリをコピー",
      "detail.close": "Spine の詳細を閉じる",
      "tree.noActivity": "このスレッドには Spine のアクティビティがありません",
      "tree.waiting": "現在のスレッドを待っています…",
      "tree.showEarlier": "以前のコンテキストを開閉",
      "tree.showCompaction": "{count} 回目の圧縮前のタスクを開閉",
      "tree.showBranches": "以前の分岐を開閉",
      "tree.viewDetails": "ノードの詳細を表示",
      "tree.empty": "この Spine Tree は空です。",
      "tree.nodes.other": "{count} ノード",
      "settings.title": "Spine の機能",
      "settings.loading": "SpineCodex の設定を読み込んでいます…",
      "settings.saving": "保存中…現在の会話は変更されません。",
      "settings.saved": "保存しました。新しい会話でこの設定が使用され、現在の会話は変更されません。",
      "settings.unavailable": "このホストでは Spine 機能を利用できません。最新の SpineCodex が動作していることを確認してください。",
      "settings.error": "SpineCodex の設定を読み込めませんでした。",
      "settings.retry": "再試行",
      "settings.applies": "変更は新しい会話にのみ適用されます。",
      "settings.toggle": "{label} を切り替え",
      "feature.spine_jit.label": "Spine JIT",
      "feature.spine_jit.description": "Spine のタスクツリー、ノードのライフサイクル、コンテキスト投影を有効にします。",
      "feature.spine_trim.label": "Spine Trim",
      "feature.spine_trim.description": "必要な証拠を保持しながら、生成直後の大きなツール結果投影をモデルが削減できるようにします。",
      "feature.spine_spawn.label": "Spine Spawn",
      "feature.spine_spawn.description": "異なる Spine 分岐を並列実行し、その結果を統合します。",
      "feature.spinetree_memory_projection.label": "Spine Tree メモリ投影",
      "feature.spinetree_memory_projection.description": "閉じたノードのメモリをワークスペースの .codex/spinetree/ に Markdown ファイルとして出力します。",
      "host.local": "ローカル",
    }),
    ko: Object.freeze({
      "task.current": "현재 작업",
      "task.completed": "완료된 작업",
      "task.previous": "이전 작업",
      "task.generic": "작업",
      "branches.hidden.other": "이전 분기 {count}개",
      "branches.hide.other": "이전 분기 {count}개 접기",
      "context.earlier": "이전 컨텍스트",
      "context.compactions.other": "{count}회 압축됨",
      "context.beforeCompaction": "{count}번째 압축 전",
      "context.nodes.other": "노드 {count}개",
      "context.additionalHidden": "추가 노드 숨김",
      "context.current": "현재 컨텍스트",
      "spawn.parallelTask": "병렬 작업 {count}",
      "spawn.title": "Spine · 병렬 {count}",
      "status.running": "진행 중",
      "status.failed": "실패",
      "status.aborted": "중단됨",
      "status.completed": "완료됨",
      "status.compacted": "압축됨",
      "status.opened": "열림",
      "spawnStatus.starting": "시작 중",
      "spawnStatus.working": "작업 중",
      "spawnStatus.completed": "완료됨",
      "spawnStatus.finished": "종료됨",
      "spawnStatus.failed": "실패",
      "spawnStatus.interrupted": "중단됨",
      "spawnStatus.notFound": "찾을 수 없음",
      "spawnStatus.unknown": "알 수 없음",
      "timing.waiting": "{duration} 대기",
      "timing.running": "{duration} 동안 실행 중",
      "timing.ran": "{duration} 동안 실행",
      "timing.now": "현재",
      "pressure.added": "이 노드를 연 뒤 입력 토큰이 약 {context}개 증가함{range}",
      "pressure.missingCurrent": "현재 토큰 사용량을 확인할 수 없습니다",
      "pressure.missingBaseline": "노드를 열었을 때의 토큰 기준값이 없습니다",
      "pressure.coordinateMismatch": "두 토큰 측정값의 좌표계가 다릅니다",
      "pressure.unavailable": "컨텍스트 증가량을 확인할 수 없습니다",
      "feedback.subagentNotReady": "하위 에이전트가 아직 준비되지 않았습니다",
      "feedback.copied": "복사됨",
      "detail.children.other": "하위 노드 {count}개",
      "detail.branchPath": "분기 경로",
      "detail.task": "작업",
      "detail.agentPath": "에이전트 경로",
      "detail.childThread": "하위 대화",
      "detail.runtime": "관측 실행 시간",
      "detail.memory": "종료 메모리",
      "detail.memoryTruncated": "캐시의 긴 메모리가 잘렸습니다",
      "detail.memoryPending": "이 노드가 닫히면 후속 컨텍스트용 메모리가 여기에 표시됩니다.",
      "detail.contextGrowth": "컨텍스트 증가량",
      "detail.eventRange": "이벤트 범위",
      "detail.openSubagent": "하위 에이전트 열기",
      "detail.hideSubtree": "하위 트리 접기",
      "detail.showSubtree": "하위 트리 펼치기",
      "detail.copyNodeId": "노드 ID 복사",
      "detail.copyChildThreadId": "하위 대화 ID 복사",
      "detail.copyMemory": "종료 메모리 복사",
      "detail.close": "Spine 세부 정보 닫기",
      "tree.noActivity": "이 대화에는 Spine 활동이 없습니다",
      "tree.waiting": "현재 대화를 기다리는 중…",
      "tree.showEarlier": "이전 컨텍스트 펼치기 또는 접기",
      "tree.showCompaction": "{count}번째 압축 전 작업 펼치기 또는 접기",
      "tree.showBranches": "이전 분기 펼치기 또는 접기",
      "tree.viewDetails": "노드 세부 정보 보기",
      "tree.empty": "이 Spine Tree는 비어 있습니다.",
      "tree.nodes.other": "노드 {count}개",
      "settings.title": "Spine 기능",
      "settings.loading": "SpineCodex 설정을 불러오는 중…",
      "settings.saving": "저장 중…현재 대화는 변경되지 않습니다.",
      "settings.saved": "저장되었습니다. 새 대화에는 이 설정이 적용되며 현재 대화는 그대로 유지됩니다.",
      "settings.unavailable": "이 호스트에서는 Spine 기능을 사용할 수 없습니다. 최신 SpineCodex가 실행 중인지 확인하세요.",
      "settings.error": "SpineCodex 설정을 불러올 수 없습니다.",
      "settings.retry": "다시 시도",
      "settings.applies": "변경 사항은 새 대화에만 적용됩니다.",
      "settings.toggle": "{label} 전환",
      "feature.spine_jit.label": "Spine JIT",
      "feature.spine_jit.description": "Spine 작업 트리, 노드 수명 주기 및 컨텍스트 투영을 활성화합니다.",
      "feature.spine_trim.label": "Spine Trim",
      "feature.spine_trim.description": "필요한 증거를 유지하면서 방금 생성된 대형 도구 결과 투영을 모델이 줄일 수 있게 합니다.",
      "feature.spine_spawn.label": "Spine Spawn",
      "feature.spine_spawn.description": "서로 다른 Spine 분기를 병렬로 실행하고 결과를 합칩니다.",
      "feature.spinetree_memory_projection.label": "Spine Tree 메모리 투영",
      "feature.spinetree_memory_projection.description": "닫힌 노드 메모리를 작업 공간의 .codex/spinetree/ 아래 Markdown 파일로 투영합니다.",
      "host.local": "로컬",
    }),
    de: Object.freeze({
      "task.current": "Aktuelle Aufgabe",
      "task.completed": "Abgeschlossene Aufgabe",
      "task.previous": "Frühere Aufgabe",
      "task.generic": "Aufgabe",
      "branches.hidden.one": "{count} früherer Zweig",
      "branches.hidden.other": "{count} frühere Zweige",
      "branches.hide.one": "{count} früheren Zweig einklappen",
      "branches.hide.other": "{count} frühere Zweige einklappen",
      "context.earlier": "Früherer Kontext",
      "context.compactions.one": "{count} Komprimierung",
      "context.compactions.other": "{count} Komprimierungen",
      "context.beforeCompaction": "Vor Komprimierung {count}",
      "context.nodes.one": "{count} Knoten",
      "context.nodes.other": "{count} Knoten",
      "context.additionalHidden": "Weitere Knoten ausgeblendet",
      "context.current": "Aktueller Kontext",
      "spawn.parallelTask": "Parallele Aufgabe {count}",
      "spawn.title": "Spine · Parallel {count}",
      "status.running": "Wird ausgeführt",
      "status.failed": "Fehlgeschlagen",
      "status.aborted": "Abgebrochen",
      "status.completed": "Abgeschlossen",
      "status.compacted": "Komprimiert",
      "status.opened": "Geöffnet",
      "spawnStatus.starting": "Wird gestartet",
      "spawnStatus.working": "In Arbeit",
      "spawnStatus.completed": "Abgeschlossen",
      "spawnStatus.finished": "Beendet",
      "spawnStatus.failed": "Fehlgeschlagen",
      "spawnStatus.interrupted": "Unterbrochen",
      "spawnStatus.notFound": "Nicht gefunden",
      "spawnStatus.unknown": "Unbekannt",
      "timing.waiting": "Wartet seit {duration}",
      "timing.running": "Läuft seit {duration}",
      "timing.ran": "Lief {duration}",
      "timing.now": "jetzt",
      "pressure.added": "Seit dem Öffnen dieses Knotens kamen etwa {context} Eingabe-Token hinzu{range}",
      "pressure.missingCurrent": "Die aktuelle Token-Nutzung ist nicht verfügbar",
      "pressure.missingBaseline": "Der Token-Ausgangswert beim Öffnen fehlt",
      "pressure.coordinateMismatch": "Die Token-Messungen verwenden unterschiedliche Koordinatensysteme",
      "pressure.unavailable": "Das Kontextwachstum ist nicht verfügbar",
      "feedback.subagentNotReady": "Der Unteragent ist noch nicht bereit",
      "feedback.copied": "Kopiert",
      "detail.children.one": "{count} Unterknoten",
      "detail.children.other": "{count} Unterknoten",
      "detail.branchPath": "Zweigpfad",
      "detail.task": "Aufgabe",
      "detail.agentPath": "Agentenpfad",
      "detail.childThread": "Unterhaltung des Unteragenten",
      "detail.runtime": "Beobachtete Laufzeit",
      "detail.memory": "Abschlussspeicher",
      "detail.memoryTruncated": "Längerer zwischengespeicherter Speicher wurde gekürzt",
      "detail.memoryPending": "Nach dem Schließen dieses Knotens erscheint hier ein Fortsetzungsspeicher.",
      "detail.contextGrowth": "Kontextwachstum",
      "detail.eventRange": "Ereignisbereich",
      "detail.openSubagent": "Unteragent öffnen",
      "detail.hideSubtree": "Unterbaum einklappen",
      "detail.showSubtree": "Unterbaum aufklappen",
      "detail.copyNodeId": "Knoten-ID kopieren",
      "detail.copyChildThreadId": "ID der Unteragent-Unterhaltung kopieren",
      "detail.copyMemory": "Abschlussspeicher kopieren",
      "detail.close": "Spine-Details schließen",
      "tree.noActivity": "Keine Spine-Aktivität in dieser Unterhaltung",
      "tree.waiting": "Warten auf die aktuelle Unterhaltung…",
      "tree.showEarlier": "Früheren Kontext ein- oder ausblenden",
      "tree.showCompaction": "Aufgaben vor Komprimierung {count} ein- oder ausblenden",
      "tree.showBranches": "Frühere Zweige ein- oder ausblenden",
      "tree.viewDetails": "Knotendetails anzeigen",
      "tree.empty": "Dieser Spine Tree ist leer.",
      "tree.nodes.one": "{count} Knoten",
      "tree.nodes.other": "{count} Knoten",
      "settings.title": "Spine-Funktionen",
      "settings.loading": "SpineCodex-Einstellungen werden geladen…",
      "settings.saving": "Wird gespeichert…Die aktuelle Unterhaltung ändert sich nicht.",
      "settings.saved": "Gespeichert. Neue Unterhaltungen verwenden diese Einstellung; die aktuelle bleibt unverändert.",
      "settings.unavailable": "Auf diesem Host sind keine Spine-Funktionen verfügbar. Stelle sicher, dass die neueste SpineCodex-Version läuft.",
      "settings.error": "SpineCodex-Einstellungen konnten nicht geladen werden.",
      "settings.retry": "Erneut versuchen",
      "settings.applies": "Änderungen gelten nur für neue Unterhaltungen.",
      "settings.toggle": "{label} umschalten",
      "feature.spine_jit.label": "Spine JIT",
      "feature.spine_jit.description": "Aktiviert Spine-Aufgabenbäume, Knotenlebenszyklen und Kontextprojektion.",
      "feature.spine_trim.label": "Spine Trim",
      "feature.spine_trim.description": "Erlaubt dem Modell, eine gerade erzeugte große Werkzeugergebnis-Projektion zu kürzen und benötigte Belege zu behalten.",
      "feature.spine_spawn.label": "Spine Spawn",
      "feature.spine_spawn.description": "Führt unterschiedliche Spine-Zweige parallel aus und führt ihre Ergebnisse zusammen.",
      "feature.spinetree_memory_projection.label": "Spine-Tree-Speicherprojektion",
      "feature.spinetree_memory_projection.description": "Projiziert den Speicher geschlossener Knoten als Markdown-Dateien unter .codex/spinetree/ im Arbeitsbereich.",
      "host.local": "Lokal",
    }),
    fr: Object.freeze({
      "task.current": "Tâche actuelle",
      "task.completed": "Tâche terminée",
      "task.previous": "Tâche précédente",
      "task.generic": "Tâche",
      "branches.hidden.one": "{count} branche précédente",
      "branches.hidden.other": "{count} branches précédentes",
      "branches.hide.one": "Replier {count} branche précédente",
      "branches.hide.other": "Replier {count} branches précédentes",
      "context.earlier": "Contexte antérieur",
      "context.compactions.one": "{count} compression",
      "context.compactions.other": "{count} compressions",
      "context.beforeCompaction": "Avant la compression {count}",
      "context.nodes.one": "{count} nœud",
      "context.nodes.other": "{count} nœuds",
      "context.additionalHidden": "Nœuds supplémentaires masqués",
      "context.current": "Contexte actuel",
      "spawn.parallelTask": "Tâche parallèle {count}",
      "spawn.title": "Spine · Parallèle {count}",
      "status.running": "En cours",
      "status.failed": "Échec",
      "status.aborted": "Abandonné",
      "status.completed": "Terminé",
      "status.compacted": "Compressé",
      "status.opened": "Ouvert",
      "spawnStatus.starting": "Démarrage",
      "spawnStatus.working": "En cours",
      "spawnStatus.completed": "Terminé",
      "spawnStatus.finished": "Fini",
      "spawnStatus.failed": "Échec",
      "spawnStatus.interrupted": "Interrompu",
      "spawnStatus.notFound": "Introuvable",
      "spawnStatus.unknown": "Inconnu",
      "timing.waiting": "En attente depuis {duration}",
      "timing.running": "En cours depuis {duration}",
      "timing.ran": "Exécuté pendant {duration}",
      "timing.now": "maintenant",
      "pressure.added": "Environ {context} jetons d’entrée ajoutés depuis l’ouverture de ce nœud{range}",
      "pressure.missingCurrent": "L’utilisation actuelle des jetons est indisponible",
      "pressure.missingBaseline": "La référence de jetons à l’ouverture est indisponible",
      "pressure.coordinateMismatch": "Les mesures de jetons utilisent des systèmes de coordonnées différents",
      "pressure.unavailable": "La croissance du contexte est indisponible",
      "feedback.subagentNotReady": "Le sous-agent n’est pas encore prêt",
      "feedback.copied": "Copié",
      "detail.children.one": "{count} nœud enfant",
      "detail.children.other": "{count} nœuds enfants",
      "detail.branchPath": "Chemin de branche",
      "detail.task": "Tâche",
      "detail.agentPath": "Chemin de l’agent",
      "detail.childThread": "Conversation enfant",
      "detail.runtime": "Durée d’exécution observée",
      "detail.memory": "Mémoire de fermeture",
      "detail.memoryTruncated": "La mémoire longue mise en cache a été tronquée",
      "detail.memoryPending": "Une mémoire de continuation apparaîtra ici après la fermeture de ce nœud.",
      "detail.contextGrowth": "Croissance du contexte",
      "detail.eventRange": "Plage d’événements",
      "detail.openSubagent": "Ouvrir le sous-agent",
      "detail.hideSubtree": "Replier le sous-arbre",
      "detail.showSubtree": "Déplier le sous-arbre",
      "detail.copyNodeId": "Copier l’ID du nœud",
      "detail.copyChildThreadId": "Copier l’ID de la conversation enfant",
      "detail.copyMemory": "Copier la mémoire de fermeture",
      "detail.close": "Fermer les détails Spine",
      "tree.noActivity": "Aucune activité Spine dans cette conversation",
      "tree.waiting": "En attente de la conversation actuelle…",
      "tree.showEarlier": "Afficher ou masquer le contexte antérieur",
      "tree.showCompaction": "Afficher ou masquer les tâches antérieures à la compression {count}",
      "tree.showBranches": "Afficher ou masquer les branches précédentes",
      "tree.viewDetails": "Afficher les détails du nœud",
      "tree.empty": "Ce Spine Tree est vide.",
      "tree.nodes.one": "{count} nœud",
      "tree.nodes.other": "{count} nœuds",
      "settings.title": "Fonctions Spine",
      "settings.loading": "Chargement des réglages SpineCodex…",
      "settings.saving": "Enregistrement…La conversation actuelle ne changera pas.",
      "settings.saved": "Enregistré. Les nouvelles conversations utiliseront ce réglage ; la conversation actuelle reste inchangée.",
      "settings.unavailable": "Aucune fonction Spine n’est disponible sur cet hôte. Vérifiez qu’il utilise la dernière version de SpineCodex.",
      "settings.error": "Impossible de charger les réglages SpineCodex.",
      "settings.retry": "Réessayer",
      "settings.applies": "Les modifications s’appliquent uniquement aux nouvelles conversations.",
      "settings.toggle": "Activer ou désactiver {label}",
      "feature.spine_jit.label": "Spine JIT",
      "feature.spine_jit.description": "Active les arbres de tâches Spine, les cycles de vie des nœuds et la projection du contexte.",
      "feature.spine_trim.label": "Spine Trim",
      "feature.spine_trim.description": "Permet au modèle de réduire une grande projection de résultat d’outil tout juste produite en conservant les preuves utiles.",
      "feature.spine_spawn.label": "Spine Spawn",
      "feature.spine_spawn.description": "Exécute en parallèle des branches Spine distinctes et rassemble leurs résultats.",
      "feature.spinetree_memory_projection.label": "Projection de mémoire Spine Tree",
      "feature.spinetree_memory_projection.description": "Projette la mémoire des nœuds fermés dans des fichiers Markdown sous .codex/spinetree/ dans l’espace de travail.",
      "host.local": "Local",
    }),
    es: Object.freeze({
      "task.current": "Tarea actual",
      "task.completed": "Tarea completada",
      "task.previous": "Tarea anterior",
      "task.generic": "Tarea",
      "branches.hidden.one": "{count} rama anterior",
      "branches.hidden.other": "{count} ramas anteriores",
      "branches.hide.one": "Contraer {count} rama anterior",
      "branches.hide.other": "Contraer {count} ramas anteriores",
      "context.earlier": "Contexto anterior",
      "context.compactions.one": "{count} compresión",
      "context.compactions.other": "{count} compresiones",
      "context.beforeCompaction": "Antes de la compresión {count}",
      "context.nodes.one": "{count} nodo",
      "context.nodes.other": "{count} nodos",
      "context.additionalHidden": "Hay más nodos ocultos",
      "context.current": "Contexto actual",
      "spawn.parallelTask": "Tarea paralela {count}",
      "spawn.title": "Spine · Paralela {count}",
      "status.running": "En curso",
      "status.failed": "Error",
      "status.aborted": "Cancelado",
      "status.completed": "Completado",
      "status.compacted": "Comprimido",
      "status.opened": "Abierto",
      "spawnStatus.starting": "Iniciando",
      "spawnStatus.working": "Trabajando",
      "spawnStatus.completed": "Completado",
      "spawnStatus.finished": "Finalizado",
      "spawnStatus.failed": "Error",
      "spawnStatus.interrupted": "Interrumpido",
      "spawnStatus.notFound": "No encontrado",
      "spawnStatus.unknown": "Desconocido",
      "timing.waiting": "Esperando desde hace {duration}",
      "timing.running": "En ejecución desde hace {duration}",
      "timing.ran": "Se ejecutó durante {duration}",
      "timing.now": "ahora",
      "pressure.added": "Se añadieron aproximadamente {context} tokens de entrada desde que se abrió este nodo{range}",
      "pressure.missingCurrent": "El uso actual de tokens no está disponible",
      "pressure.missingBaseline": "No está disponible la referencia de tokens al abrir el nodo",
      "pressure.coordinateMismatch": "Las mediciones de tokens usan sistemas de coordenadas distintos",
      "pressure.unavailable": "El crecimiento del contexto no está disponible",
      "feedback.subagentNotReady": "El subagente todavía no está listo",
      "feedback.copied": "Copiado",
      "detail.children.one": "{count} nodo hijo",
      "detail.children.other": "{count} nodos hijos",
      "detail.branchPath": "Ruta de la rama",
      "detail.task": "Tarea",
      "detail.agentPath": "Ruta del agente",
      "detail.childThread": "Conversación hija",
      "detail.runtime": "Tiempo de ejecución observado",
      "detail.memory": "Memoria de cierre",
      "detail.memoryTruncated": "La memoria larga en caché se ha truncado",
      "detail.memoryPending": "Cuando se cierre este nodo aparecerá aquí una memoria de continuación.",
      "detail.contextGrowth": "Crecimiento del contexto",
      "detail.eventRange": "Intervalo de eventos",
      "detail.openSubagent": "Abrir subagente",
      "detail.hideSubtree": "Contraer subárbol",
      "detail.showSubtree": "Expandir subárbol",
      "detail.copyNodeId": "Copiar ID del nodo",
      "detail.copyChildThreadId": "Copiar ID de la conversación hija",
      "detail.copyMemory": "Copiar memoria de cierre",
      "detail.close": "Cerrar detalles de Spine",
      "tree.noActivity": "No hay actividad de Spine en esta conversación",
      "tree.waiting": "Esperando la conversación actual…",
      "tree.showEarlier": "Mostrar u ocultar el contexto anterior",
      "tree.showCompaction": "Mostrar u ocultar tareas anteriores a la compresión {count}",
      "tree.showBranches": "Mostrar u ocultar ramas anteriores",
      "tree.viewDetails": "Ver detalles del nodo",
      "tree.empty": "Este Spine Tree está vacío.",
      "tree.nodes.one": "{count} nodo",
      "tree.nodes.other": "{count} nodos",
      "settings.title": "Funciones de Spine",
      "settings.loading": "Cargando la configuración de SpineCodex…",
      "settings.saving": "Guardando…La conversación actual no cambiará.",
      "settings.saved": "Guardado. Las conversaciones nuevas usarán esta opción; la actual no cambiará.",
      "settings.unavailable": "No hay funciones de Spine disponibles en este host. Comprueba que utiliza la versión más reciente de SpineCodex.",
      "settings.error": "No se pudo cargar la configuración de SpineCodex.",
      "settings.retry": "Reintentar",
      "settings.applies": "Los cambios solo se aplican a conversaciones nuevas.",
      "settings.toggle": "Alternar {label}",
      "feature.spine_jit.label": "Spine JIT",
      "feature.spine_jit.description": "Activa los árboles de tareas de Spine, los ciclos de vida de los nodos y la proyección del contexto.",
      "feature.spine_trim.label": "Spine Trim",
      "feature.spine_trim.description": "Permite que el modelo reduzca una proyección grande de un resultado de herramienta recién generado conservando las pruebas necesarias.",
      "feature.spine_spawn.label": "Spine Spawn",
      "feature.spine_spawn.description": "Ejecuta en paralelo ramas diferenciadas de Spine y reúne sus resultados.",
      "feature.spinetree_memory_projection.label": "Proyección de memoria de Spine Tree",
      "feature.spinetree_memory_projection.description": "Proyecta la memoria de nodos cerrados en archivos Markdown dentro de .codex/spinetree/ en el espacio de trabajo.",
      "host.local": "Local",
    }),
    "pt-BR": Object.freeze({
      "task.current": "Tarefa atual",
      "task.completed": "Tarefa concluída",
      "task.previous": "Tarefa anterior",
      "task.generic": "Tarefa",
      "branches.hidden.one": "{count} ramificação anterior",
      "branches.hidden.other": "{count} ramificações anteriores",
      "branches.hide.one": "Recolher {count} ramificação anterior",
      "branches.hide.other": "Recolher {count} ramificações anteriores",
      "context.earlier": "Contexto anterior",
      "context.compactions.one": "{count} compactação",
      "context.compactions.other": "{count} compactações",
      "context.beforeCompaction": "Antes da compactação {count}",
      "context.nodes.one": "{count} nó",
      "context.nodes.other": "{count} nós",
      "context.additionalHidden": "Outros nós ocultos",
      "context.current": "Contexto atual",
      "spawn.parallelTask": "Tarefa paralela {count}",
      "spawn.title": "Spine · Paralela {count}",
      "status.running": "Em andamento",
      "status.failed": "Falhou",
      "status.aborted": "Cancelado",
      "status.completed": "Concluído",
      "status.compacted": "Compactado",
      "status.opened": "Aberto",
      "spawnStatus.starting": "Iniciando",
      "spawnStatus.working": "Trabalhando",
      "spawnStatus.completed": "Concluído",
      "spawnStatus.finished": "Finalizado",
      "spawnStatus.failed": "Falhou",
      "spawnStatus.interrupted": "Interrompido",
      "spawnStatus.notFound": "Não encontrado",
      "spawnStatus.unknown": "Desconhecido",
      "timing.waiting": "Aguardando há {duration}",
      "timing.running": "Em execução há {duration}",
      "timing.ran": "Executado por {duration}",
      "timing.now": "agora",
      "pressure.added": "Cerca de {context} tokens de entrada adicionados desde que este nó foi aberto{range}",
      "pressure.missingCurrent": "O uso atual de tokens não está disponível",
      "pressure.missingBaseline": "A referência de tokens na abertura não está disponível",
      "pressure.coordinateMismatch": "As medições de tokens usam sistemas de coordenadas diferentes",
      "pressure.unavailable": "O crescimento do contexto não está disponível",
      "feedback.subagentNotReady": "O subagente ainda não está pronto",
      "feedback.copied": "Copiado",
      "detail.children.one": "{count} nó filho",
      "detail.children.other": "{count} nós filhos",
      "detail.branchPath": "Caminho da ramificação",
      "detail.task": "Tarefa",
      "detail.agentPath": "Caminho do agente",
      "detail.childThread": "Conversa filha",
      "detail.runtime": "Tempo de execução observado",
      "detail.memory": "Memória de fechamento",
      "detail.memoryTruncated": "A memória longa em cache foi truncada",
      "detail.memoryPending": "Uma memória de continuação aparecerá aqui quando este nó for fechado.",
      "detail.contextGrowth": "Crescimento do contexto",
      "detail.eventRange": "Intervalo de eventos",
      "detail.openSubagent": "Abrir subagente",
      "detail.hideSubtree": "Recolher subárvore",
      "detail.showSubtree": "Expandir subárvore",
      "detail.copyNodeId": "Copiar ID do nó",
      "detail.copyChildThreadId": "Copiar ID da conversa filha",
      "detail.copyMemory": "Copiar memória de fechamento",
      "detail.close": "Fechar detalhes do Spine",
      "tree.noActivity": "Nenhuma atividade do Spine nesta conversa",
      "tree.waiting": "Aguardando a conversa atual…",
      "tree.showEarlier": "Mostrar ou ocultar o contexto anterior",
      "tree.showCompaction": "Mostrar ou ocultar tarefas anteriores à compactação {count}",
      "tree.showBranches": "Mostrar ou ocultar ramificações anteriores",
      "tree.viewDetails": "Ver detalhes do nó",
      "tree.empty": "Este Spine Tree está vazio.",
      "tree.nodes.one": "{count} nó",
      "tree.nodes.other": "{count} nós",
      "settings.title": "Recursos do Spine",
      "settings.loading": "Carregando as configurações do SpineCodex…",
      "settings.saving": "Salvando…A conversa atual não será alterada.",
      "settings.saved": "Salvo. Novas conversas usarão esta configuração; a conversa atual não muda.",
      "settings.unavailable": "Nenhum recurso do Spine está disponível neste host. Verifique se ele está executando a versão mais recente do SpineCodex.",
      "settings.error": "Não foi possível carregar as configurações do SpineCodex.",
      "settings.retry": "Tentar novamente",
      "settings.applies": "As alterações se aplicam apenas a novas conversas.",
      "settings.toggle": "Alternar {label}",
      "feature.spine_jit.label": "Spine JIT",
      "feature.spine_jit.description": "Ativa árvores de tarefas do Spine, ciclos de vida dos nós e projeção de contexto.",
      "feature.spine_trim.label": "Spine Trim",
      "feature.spine_trim.description": "Permite que o modelo reduza uma projeção grande de resultado de ferramenta recém-produzida preservando as evidências necessárias.",
      "feature.spine_spawn.label": "Spine Spawn",
      "feature.spine_spawn.description": "Executa ramificações distintas do Spine em paralelo e reúne seus resultados.",
      "feature.spinetree_memory_projection.label": "Projeção de memória do Spine Tree",
      "feature.spinetree_memory_projection.description": "Projeta a memória de nós fechados em arquivos Markdown em .codex/spinetree/ no espaço de trabalho.",
      "host.local": "Local",
    }),
    ru: Object.freeze({
      "task.current": "Текущая задача",
      "task.completed": "Завершённая задача",
      "task.previous": "Предыдущая задача",
      "task.generic": "Задача",
      "branches.hidden.one": "{count} предыдущая ветвь",
      "branches.hidden.few": "{count} предыдущие ветви",
      "branches.hidden.many": "{count} предыдущих ветвей",
      "branches.hidden.other": "{count} предыдущих ветвей",
      "branches.hide.one": "Свернуть {count} предыдущую ветвь",
      "branches.hide.few": "Свернуть {count} предыдущие ветви",
      "branches.hide.many": "Свернуть {count} предыдущих ветвей",
      "branches.hide.other": "Свернуть {count} предыдущих ветвей",
      "context.earlier": "Ранний контекст",
      "context.compactions.one": "{count} сжатие",
      "context.compactions.few": "{count} сжатия",
      "context.compactions.many": "{count} сжатий",
      "context.compactions.other": "{count} сжатия",
      "context.beforeCompaction": "До сжатия {count}",
      "context.nodes.one": "{count} узел",
      "context.nodes.few": "{count} узла",
      "context.nodes.many": "{count} узлов",
      "context.nodes.other": "{count} узла",
      "context.additionalHidden": "Дополнительные узлы скрыты",
      "context.current": "Текущий контекст",
      "spawn.parallelTask": "Параллельная задача {count}",
      "spawn.title": "Spine · Параллельная {count}",
      "status.running": "Выполняется",
      "status.failed": "Ошибка",
      "status.aborted": "Отменено",
      "status.completed": "Завершено",
      "status.compacted": "Сжато",
      "status.opened": "Открыто",
      "spawnStatus.starting": "Запускается",
      "spawnStatus.working": "В работе",
      "spawnStatus.completed": "Завершено",
      "spawnStatus.finished": "Окончено",
      "spawnStatus.failed": "Ошибка",
      "spawnStatus.interrupted": "Прервано",
      "spawnStatus.notFound": "Не найдено",
      "spawnStatus.unknown": "Неизвестно",
      "timing.waiting": "Ожидание: {duration}",
      "timing.running": "Выполняется {duration}",
      "timing.ran": "Выполнялось {duration}",
      "timing.now": "сейчас",
      "pressure.added": "С момента открытия этого узла добавлено около {context} входных токенов{range}",
      "pressure.missingCurrent": "Текущее использование токенов недоступно",
      "pressure.missingBaseline": "Нет исходного значения токенов при открытии",
      "pressure.coordinateMismatch": "Измерения токенов используют разные системы координат",
      "pressure.unavailable": "Рост контекста недоступен",
      "feedback.subagentNotReady": "Подагент ещё не готов",
      "feedback.copied": "Скопировано",
      "detail.children.one": "{count} дочерний узел",
      "detail.children.few": "{count} дочерних узла",
      "detail.children.many": "{count} дочерних узлов",
      "detail.children.other": "{count} дочернего узла",
      "detail.branchPath": "Путь ветви",
      "detail.task": "Задача",
      "detail.agentPath": "Путь агента",
      "detail.childThread": "Дочерний диалог",
      "detail.runtime": "Наблюдаемое время выполнения",
      "detail.memory": "Память при закрытии",
      "detail.memoryTruncated": "Длинная кэшированная память была обрезана",
      "detail.memoryPending": "После закрытия узла здесь появится память для продолжения.",
      "detail.contextGrowth": "Рост контекста",
      "detail.eventRange": "Диапазон событий",
      "detail.openSubagent": "Открыть подагента",
      "detail.hideSubtree": "Свернуть поддерево",
      "detail.showSubtree": "Развернуть поддерево",
      "detail.copyNodeId": "Скопировать ID узла",
      "detail.copyChildThreadId": "Скопировать ID дочернего диалога",
      "detail.copyMemory": "Скопировать память при закрытии",
      "detail.close": "Закрыть сведения Spine",
      "tree.noActivity": "В этом диалоге нет активности Spine",
      "tree.waiting": "Ожидание текущего диалога…",
      "tree.showEarlier": "Показать или скрыть ранний контекст",
      "tree.showCompaction": "Показать или скрыть задачи до сжатия {count}",
      "tree.showBranches": "Показать или скрыть предыдущие ветви",
      "tree.viewDetails": "Показать сведения об узле",
      "tree.empty": "Этот Spine Tree пуст.",
      "tree.nodes.one": "{count} узел",
      "tree.nodes.few": "{count} узла",
      "tree.nodes.many": "{count} узлов",
      "tree.nodes.other": "{count} узла",
      "settings.title": "Функции Spine",
      "settings.loading": "Загрузка настроек SpineCodex…",
      "settings.saving": "Сохранение…Текущий диалог не изменится.",
      "settings.saved": "Сохранено. Новые диалоги будут использовать эту настройку; текущий диалог не изменится.",
      "settings.unavailable": "На этом хосте нет функций Spine. Убедитесь, что используется последняя версия SpineCodex.",
      "settings.error": "Не удалось загрузить настройки SpineCodex.",
      "settings.retry": "Повторить",
      "settings.applies": "Изменения применяются только к новым диалогам.",
      "settings.toggle": "Переключить {label}",
      "feature.spine_jit.label": "Spine JIT",
      "feature.spine_jit.description": "Включает деревья задач Spine, жизненный цикл узлов и проекцию контекста.",
      "feature.spine_trim.label": "Spine Trim",
      "feature.spine_trim.description": "Позволяет модели сокращать только что созданную крупную проекцию результата инструмента, сохраняя нужные доказательства.",
      "feature.spine_spawn.label": "Spine Spawn",
      "feature.spine_spawn.description": "Параллельно выполняет различные ветви Spine и объединяет их результаты.",
      "feature.spinetree_memory_projection.label": "Проекция памяти Spine Tree",
      "feature.spinetree_memory_projection.description": "Проецирует память закрытых узлов в файлы Markdown в .codex/spinetree/ рабочего пространства.",
      "host.local": "Локально",
    }),
  });

  if (window[GLOBAL_KEY]?.version === VERSION) return VERSION;
  try {
    window[GLOBAL_KEY]?.destroy?.();
  } catch {}

  const state = {
    snapshots: readSnapshotCache(),
    spawns: new Map(),
    namedSpawnThreads: new Set(),
    namingSpawnThreads: new Set(),
    rows: new Map(),
    selectedRows: new Map(),
    expandedBuckets: new Set(),
    expandedEpochs: new Set(),
    expandedSubtrees: new Set(),
    threadAliases: readThreadAliases(),
    pendingSidebarRaw: null,
    pendingPreviousMainId: null,
    expanded: readExpandedState(),
    activeThreadId: null,
    frame: 0,
    treeMotionTimer: 0,
    treeMotionToken: 0,
    switchFrame: 0,
    mountFrame: 0,
    mountAttempts: 0,
    settingsFrame: 0,
    settingsAttempts: 0,
    settingsSection: null,
    settingsModelSection: null,
    settingsUi: null,
    settingsHostId: null,
    settingsLoadedHostId: null,
    settingsRequestEpoch: 0,
    settingsLoading: false,
    settingsSaving: false,
    settingsAvailable: false,
    settingsFeatures: new Map(),
    settingsSavingFeature: null,
    settingsSavedFeature: null,
    settingsError: null,
    settingsSavedTimer: 0,
    subagentLabelFrame: 0,
    subagentLabelAttempts: 0,
    subagentListObserver: null,
    subagentListRoot: null,
    subagentListSyncQueued: false,
    subagentTitleObserver: null,
    subagentTitleTimeout: 0,
    subagentTitleSettleTimer: 0,
    hostIds: ["local"],
    hostCatalogLoaded: false,
    lastActiveHostId: "local",
    requestSequence: 0,
    pendingRequests: new Map(),
    snapshotCacheDirty: false,
    snapshotWriteHandle: 0,
    snapshotWriteKind: null,
    ui: null,
    detailUi: null,
    detailMountFrame: 0,
    detailMountAttempts: 0,
    detailRefreshFrame: 0,
    detailRequested: false,
    detailTabActive: true,
    detailOpenedPane: false,
    detailToggleInProgress: false,
    detailPaneCandidate: null,
    detailPaneStableFrames: 0,
    detailPaneCollapsedFrames: 0,
    detailPaneLastMeasure: null,
    detailMountRetries: 0,
    sidebarObserver: null,
    sidebarRoot: null,
    threadObserver: null,
    threadRoot: null,
    panelObserver: null,
    panelRoot: null,
    summarySurfaceObserver: null,
    summarySurfacePanels: [],
    summaryMountQueued: false,
    summaryTriggerObserver: null,
    summaryTriggerTimer: 0,
    locale: resolveCodexLocale(),
    localeSource: codexLocaleSource(),
    localeObserver: null,
    destroyed: false,
  };

  function readExpandedState() {
    try {
      return localStorage.getItem("spine-codex.view.expanded") !== "false";
    } catch {
      return true;
    }
  }

  function writeExpandedState() {
    try {
      localStorage.setItem("spine-codex.view.expanded", String(state.expanded));
    } catch {}
  }

  function readThreadAliases() {
    try {
      const saved = JSON.parse(localStorage.getItem(THREAD_ALIASES_KEY) || "{}");
      return new Map(
        Object.entries(saved).filter(([raw, threadId]) =>
          raw && typeof threadId === "string" && normalizeThreadId(threadId)),
      );
    } catch {
      return new Map();
    }
  }

  function writeThreadAliases() {
    try {
      localStorage.setItem(
        THREAD_ALIASES_KEY,
        JSON.stringify(Object.fromEntries(state.threadAliases)),
      );
    } catch {}
  }

  function jsonSafeScalar(value, fallback = 0) {
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "number" || typeof value === "string") return value;
    return fallback;
  }

  function nullableSafeScalar(value) {
    return value == null ? null : jsonSafeScalar(value, null);
  }

  function normalizeContextPressure(pressure) {
    if (!pressure || typeof pressure !== "object") return null;
    const normalized = {
      openInputTokens: nullableSafeScalar(pressure.openInputTokens),
      currentInputTokens: nullableSafeScalar(pressure.currentInputTokens),
      contextTokens: nullableSafeScalar(pressure.contextTokens),
      problem: typeof pressure.problem === "string" ? pressure.problem : null,
    };
    return Object.values(normalized).some((value) => value != null) ? normalized : null;
  }

  function normalizeSpawnLink(link) {
    if (!link || typeof link !== "object") return null;
    const callId = typeof link.callId === "string" ? link.callId : "";
    const ordinal = Number(link.ordinal);
    const threadId = normalizeThreadId(link.threadId);
    if (!callId || !Number.isInteger(ordinal) || ordinal < 0 || !threadId) return null;
    return {
      callId,
      ordinal,
      threadId,
      agentPath: typeof link.agentPath === "string" ? link.agentPath : null,
      summary: typeof link.summary === "string" ? link.summary.slice(0, 1_000) : null,
      observedAtMs: normalizeTimestamp(link.observedAtMs),
      startedAtMs: normalizeTimestamp(link.startedAtMs),
      completedAtMs: normalizeTimestamp(link.completedAtMs),
    };
  }

  function normalizeTimestamp(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : null;
  }

  function normalizeSnapshot(snapshot, cachedAt = Date.now()) {
    if (!snapshot || typeof snapshot.threadId !== "string") return null;
    if (!Array.isArray(snapshot.nodes) || typeof snapshot.activeNodeId !== "string") {
      return null;
    }
    const threadId = normalizeThreadId(snapshot.threadId);
    if (!threadId) return null;
    const nodes = snapshot.nodes
      .filter((node) => node && typeof node.nodeId === "string")
      .map((node) => {
        const rawMemory = typeof node.memorySummary === "string"
          ? node.memorySummary
          : "";
        return {
          nodeId: node.nodeId,
          parentId: typeof node.parentId === "string" ? node.parentId : null,
          kind: node.kind,
          status: node.status,
          summary: typeof node.summary === "string"
            ? node.summary.slice(0, 1_000)
            : null,
          memorySummary: rawMemory
            ? rawMemory.slice(0, MAX_LIVE_MEMORY_SUMMARY_CHARS)
            : null,
          memorySummaryTruncated:
            node.memorySummaryTruncated === true ||
            rawMemory.length > MAX_LIVE_MEMORY_SUMMARY_CHARS,
          spawnOutcome: node.spawnOutcome ?? null,
          spawnLink: normalizeSpawnLink(node.spawnLink),
          start: jsonSafeScalar(node.start),
          end: nullableSafeScalar(node.end),
          contextPressure: normalizeContextPressure(node.contextPressure),
        };
      });
    if (!nodes.some((node) => node.nodeId === snapshot.activeNodeId)) return null;
    return {
      threadId,
      turnId: typeof snapshot.turnId === "string" ? snapshot.turnId : "",
      snapshotSeq: jsonSafeScalar(snapshot.snapshotSeq),
      activeNodeId: snapshot.activeNodeId,
      settledSpawnCallIds: Array.isArray(snapshot.settledSpawnCallIds)
        ? snapshot.settledSpawnCallIds.filter((id) => typeof id === "string").slice(0, 512)
        : [],
      nodes,
      cachedAt: Number.isFinite(Number(cachedAt)) ? Number(cachedAt) : Date.now(),
    };
  }

  function compactSnapshotForPersistence(snapshot) {
    const normalized = normalizeSnapshot(snapshot, snapshot?.cachedAt);
    if (!normalized) return null;

    const compactNode = (node) => {
      const memorySummary = typeof node.memorySummary === "string"
        ? node.memorySummary.slice(0, MAX_PERSISTED_MEMORY_SUMMARY_CHARS)
        : null;
      return {
        ...node,
        memorySummary,
        memorySummaryTruncated:
          node.memorySummaryTruncated === true ||
          (typeof node.memorySummary === "string" &&
            node.memorySummary.length > MAX_PERSISTED_MEMORY_SUMMARY_CHARS),
      };
    };
    if (normalized.nodes.length <= MAX_PERSISTED_NODE_COUNT) {
      return { ...normalized, nodes: normalized.nodes.map(compactNode) };
    }

    const byId = new Map(normalized.nodes.map((node) => [node.nodeId, node]));
    const keep = new Set();
    const addAncestorChain = (node, force = false) => {
      const chain = [];
      const seen = new Set();
      let current = node;
      while (current && !keep.has(current.nodeId) && !seen.has(current.nodeId)) {
        seen.add(current.nodeId);
        chain.push(current);
        current = current.parentId ? byId.get(current.parentId) : null;
      }
      if (!force && keep.size + chain.length > MAX_PERSISTED_NODE_COUNT) return false;
      for (let index = chain.length - 1; index >= 0; index -= 1) {
        keep.add(chain[index].nodeId);
      }
      return true;
    };

    addAncestorChain(byId.get(normalized.activeNodeId), true);
    for (
      let index = normalized.nodes.length - 1;
      index >= 0 && keep.size < MAX_PERSISTED_NODE_COUNT;
      index -= 1
    ) {
      addAncestorChain(normalized.nodes[index]);
    }
    return {
      ...normalized,
      nodes: normalized.nodes
        .filter((node) => keep.has(node.nodeId))
        .map(compactNode),
    };
  }

  function readSnapshotCache() {
    try {
      const payload = JSON.parse(localStorage.getItem(SNAPSHOT_CACHE_KEY) || "null");
      if (
        payload?.version !== SNAPSHOT_CACHE_VERSION ||
        !Array.isArray(payload.entries)
      ) {
        return new Map();
      }
      const snapshots = new Map();
      const now = Date.now();
      for (const entry of payload.entries.slice(-MAX_THREADS)) {
        if (!Array.isArray(entry) || entry.length !== 2) continue;
        const cachedAt = Number(entry[1]?.cachedAt);
        if (
          !Number.isFinite(cachedAt) ||
          cachedAt <= 0 ||
          now - cachedAt > SNAPSHOT_CACHE_MAX_AGE_MS
        ) {
          continue;
        }
        const normalized = normalizeSnapshot(entry[1], cachedAt);
        if (!normalized || normalizeThreadId(entry[0]) !== normalized.threadId) continue;
        snapshots.delete(normalized.threadId);
        snapshots.set(normalized.threadId, normalized);
      }
      if (snapshots.size !== payload.entries.length) {
        if (snapshots.size) {
          localStorage.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify({
            version: SNAPSHOT_CACHE_VERSION,
            entries: [...snapshots.entries()],
          }));
        } else {
          localStorage.removeItem(SNAPSHOT_CACHE_KEY);
        }
      }
      return snapshots;
    } catch {
      return new Map();
    }
  }

  function writeSnapshotCache() {
    state.snapshotCacheDirty = false;
    try {
      const entries = [...state.snapshots.entries()]
        .map(([threadId, snapshot]) => [
          threadId,
          compactSnapshotForPersistence(snapshot),
        ])
        .filter(([, snapshot]) => snapshot);
      let payload = JSON.stringify({
        version: SNAPSHOT_CACHE_VERSION,
        entries,
      });
      while (payload.length > MAX_PERSISTED_CACHE_CHARS && entries.length > 1) {
        const removable = entries.findIndex(
          ([threadId]) => threadId !== state.activeThreadId,
        );
        entries.splice(removable < 0 ? 0 : removable, 1);
        payload = JSON.stringify({
          version: SNAPSHOT_CACHE_VERSION,
          entries,
        });
      }
      localStorage.setItem(SNAPSHOT_CACHE_KEY, payload);
    } catch {}
  }

  function scheduleSnapshotCacheWrite() {
    state.snapshotCacheDirty = true;
    if (state.snapshotWriteHandle) return;
    const flush = () => {
      state.snapshotWriteHandle = 0;
      state.snapshotWriteKind = null;
      if (state.snapshotCacheDirty) writeSnapshotCache();
    };
    if (typeof requestIdleCallback === "function") {
      state.snapshotWriteKind = "idle";
      state.snapshotWriteHandle = requestIdleCallback(flush, { timeout: 1_000 });
    } else {
      state.snapshotWriteKind = "timeout";
      state.snapshotWriteHandle = setTimeout(flush, 100);
    }
  }

  function cancelSnapshotCacheWrite() {
    if (!state.snapshotWriteHandle) return;
    if (state.snapshotWriteKind === "idle" && typeof cancelIdleCallback === "function") {
      cancelIdleCallback(state.snapshotWriteHandle);
    } else {
      clearTimeout(state.snapshotWriteHandle);
    }
    state.snapshotWriteHandle = 0;
    state.snapshotWriteKind = null;
  }

  function codexLocaleSource() {
    return (
      (typeof navigator === "object" ? navigator.language?.trim?.() : "") ||
      document.documentElement?.getAttribute?.("lang")?.trim() ||
      "en"
    );
  }

  function resolveCodexLocale(value = codexLocaleSource()) {
    let canonical;
    try {
      canonical = Intl.getCanonicalLocales(String(value).replace(/_/g, "-"))[0];
    } catch {
      canonical = "en";
    }
    const lower = canonical.toLowerCase();
    if (lower === "zh" || lower.startsWith("zh-")) {
      return /(?:^|[-])(hant|tw|hk|mo)(?:$|[-])/i.test(canonical)
        ? "zh-Hant"
        : "zh-Hans";
    }
    if (UI_MESSAGES[canonical]) return canonical;
    const language = canonical.split("-")[0];
    if (UI_MESSAGES[language]) return language;
    if (language === "pt" && UI_MESSAGES["pt-BR"]) return "pt-BR";
    return "en";
  }

  function messageTemplate(key, locale = state.locale) {
    return UI_MESSAGES[locale]?.[key] ?? EN_MESSAGES[key] ?? key;
  }

  function interpolate(template, values = {}) {
    return String(template).replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (_, key) =>
      values[key] == null ? "" : String(values[key]));
  }

  function t(key, values) {
    return interpolate(messageTemplate(key), values);
  }

  function formatInteger(value) {
    try {
      return new Intl.NumberFormat(state.locale, {
        maximumFractionDigits: 0,
      }).format(Number(value));
    } catch {
      return String(value);
    }
  }

  function tp(key, count, values = {}) {
    let category = "other";
    try {
      category = new Intl.PluralRules(state.locale).select(Number(count));
    } catch {}
    const localeMessages = UI_MESSAGES[state.locale] ?? EN_MESSAGES;
    const localizedKey = localeMessages[`${key}.${category}`] != null
      ? `${key}.${category}`
      : `${key}.other`;
    const fallbackKey = EN_MESSAGES[localizedKey] != null
      ? localizedKey
      : EN_MESSAGES[`${key}.other`] != null
        ? `${key}.other`
        : `${key}.one`;
    const template =
      localeMessages[localizedKey] ??
      EN_MESSAGES[fallbackKey] ??
      key;
    return interpolate(template, {
      ...values,
      count: formatInteger(count),
    });
  }

  function refreshLocale() {
    const source = codexLocaleSource();
    const locale = resolveCodexLocale(source);
    if (source === state.localeSource && locale === state.locale) return false;
    state.localeSource = source;
    if (locale === state.locale) return false;
    state.locale = locale;
    state.rows.clear();
    if (state.detailUi?.closeButton) {
      state.detailUi.closeButton.setAttribute("aria-label", t("detail.close"));
    }
    if (state.ui?.host.isConnected && state.expanded) renderActiveNow();
    if (state.detailRequested) scheduleWorkspaceDetailRefresh();
    if (state.settingsSection?.isConnected) renderSettings();
    if (activeAgentSettingsPanel()) scheduleSettingsMount(12);
    return true;
  }

  function connectLocaleObserver() {
    if (typeof MutationObserver !== "function" || !document.documentElement) return;
    state.localeObserver?.disconnect();
    state.localeObserver = new MutationObserver(() => {
      queueMicrotask(refreshLocale);
    });
    state.localeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["lang"],
    });
  }

  function onLanguageChange() {
    queueMicrotask(refreshLocale);
  }

  function normalizeThreadId(value) {
    if (typeof value !== "string") return null;
    const normalized = value.replace(/^(?:local|remote):/, "");
    if (normalized.startsWith("client-new-thread:")) return null;
    const match = normalized.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return match?.[0] ?? (normalized || null);
  }

  function mainThreadId() {
    const mainThread = document.querySelector?.('[data-pip-anchor-host="codex-main-thread"]');
    const annotated = mainThread?.querySelector("[data-response-annotation-conversation]");
    return normalizeThreadId(
      annotated?.getAttribute("data-response-annotation-conversation"),
    );
  }

  function selectedSidebarItem() {
    const items = typeof document.querySelectorAll === "function"
      ? [...document.querySelectorAll("[data-app-action-sidebar-thread-id]")]
      : [];
    return (
      items.find((item) => item.getAttribute("aria-current") === "page") ??
      items.find((item) => item.classList.contains("bg-token-list-hover-background")) ??
      null
    );
  }

  function rememberAlias(raw, threadId) {
    if (!raw || !threadId) return;
    if (state.threadAliases.get(raw) === threadId) return;
    state.threadAliases.delete(raw);
    state.threadAliases.set(raw, threadId);
    while (state.threadAliases.size > MAX_THREAD_ALIASES) {
      state.threadAliases.delete(state.threadAliases.keys().next().value);
    }
    writeThreadAliases();
  }

  function selectedThreadId() {
    const selected = selectedSidebarItem();
    const raw = selected?.getAttribute("data-app-action-sidebar-thread-id") ?? null;
    const direct = normalizeThreadId(raw);
    if (direct) return direct;

    const aliased = raw ? state.threadAliases.get(raw) ?? null : null;
    if (aliased) return aliased;

    const main = mainThreadId();
    if (raw && raw === state.pendingSidebarRaw) {
      if (main && main !== state.pendingPreviousMainId) {
        rememberAlias(raw, main);
        state.pendingSidebarRaw = null;
        state.pendingPreviousMainId = null;
        return main;
      }
      return null;
    }
    if (raw && main) rememberAlias(raw, main);
    return main;
  }

  function currentSnapshot() {
    return state.activeThreadId ? state.snapshots.get(state.activeThreadId) ?? null : null;
  }

  function compareSequence(left, right) {
    try {
      const a = BigInt(left ?? 0);
      const b = BigInt(right ?? 0);
      return a < b ? -1 : a > b ? 1 : 0;
    } catch {
      return Number(left ?? 0) - Number(right ?? 0);
    }
  }

  function attachSettledSpawnLinks(snapshot, previous, threadSpawns, settledCallIds) {
    const previousById = new Map(
      (previous?.nodes ?? []).map((node) => [node.nodeId, node]),
    );
    for (const node of snapshot.nodes) {
      const previousLink = previousById.get(node.nodeId)?.spawnLink;
      if (!node.spawnLink && previousLink) node.spawnLink = previousLink;
    }

    const transferredRows = new Map();
    const claimedNodeIds = new Set(
      snapshot.nodes.filter((node) => node.spawnLink).map((node) => node.nodeId),
    );
    for (const callId of settledCallIds) {
      const progress = threadSpawns?.get(callId);
      if (!progress?.tasks?.length) continue;
      const candidates = snapshot.nodes.filter((node) =>
        node.kind !== "root_epoch" &&
        node.spawnOutcome &&
        !claimedNodeIds.has(node.nodeId)
      );
      for (const task of progress.tasks) {
        let node = candidates.find((candidate) =>
          !claimedNodeIds.has(candidate.nodeId) &&
          candidate.summary === task.summary
        );
        if (!node) {
          node = candidates.find((candidate) => !claimedNodeIds.has(candidate.nodeId));
        }
        if (!node) continue;
        const link = normalizeSpawnLink({
          callId,
          ordinal: task.ordinal,
          threadId: task.threadId,
          agentPath: task.agentPath,
          summary: task.summary,
          observedAtMs: task.observedAtMs,
          startedAtMs: task.startedAtMs,
          completedAtMs: task.completedAtMs,
        });
        if (!link) continue;
        node.spawnLink = link;
        claimedNodeIds.add(node.nodeId);
        transferredRows.set(`spawn:${callId}:${task.ordinal}`, `node:${node.nodeId}`);
      }
    }
    return transferredRows;
  }

  function rememberSnapshot(snapshot) {
    if (!snapshot || typeof snapshot.threadId !== "string") return false;
    if (!Array.isArray(snapshot.nodes) || typeof snapshot.activeNodeId !== "string") {
      return false;
    }
    const threadId = normalizeThreadId(snapshot.threadId);
    if (!threadId) return false;
    const previous = state.snapshots.get(threadId);
    if (
      previous &&
      compareSequence(snapshot.snapshotSeq, previous.snapshotSeq) < 0
    ) {
      return false;
    }
    const normalized = normalizeSnapshot(snapshot);
    if (!normalized) return false;
    const threadSpawns = state.spawns.get(threadId);
    const settledCallIds = snapshot.settledSpawnCallIds ?? [];
    const transferredRows = attachSettledSpawnLinks(
      normalized,
      previous,
      threadSpawns,
      settledCallIds,
    );
    const selectedRow = state.selectedRows.get(threadId);
    if (selectedRow && transferredRows.has(selectedRow)) {
      state.selectedRows.set(threadId, transferredRows.get(selectedRow));
    }
    state.snapshots.delete(threadId);
    state.snapshots.set(threadId, normalized);
    trimThreadCache();
    for (const callId of settledCallIds) {
      threadSpawns?.delete(callId);
    }
    if (threadId === state.activeThreadId) scheduleNativeSubagentLabelSync(4);
    scheduleSnapshotCacheWrite();
    return true;
  }

  function trimThreadCache() {
    while (state.snapshots.size > MAX_THREADS) {
      const oldest = [...state.snapshots.keys()].find(
        (threadId) => threadId !== state.activeThreadId,
      ) ?? state.snapshots.keys().next().value;
      state.snapshots.delete(oldest);
      state.spawns.delete(oldest);
    }
  }

  function touchSnapshot(threadId) {
    const snapshot = threadId ? state.snapshots.get(threadId) : null;
    if (!snapshot) return false;
    state.snapshots.delete(threadId);
    state.snapshots.set(threadId, snapshot);
    scheduleSnapshotCacheWrite();
    return true;
  }

  function normalizeSpawnStatus(status) {
    const key = String(status || "").replace(/[^a-z]/gi, "").toLowerCase();
    if (["pending", "pendinginit", "preinit", "waiting", "starting"].includes(key)) {
      return "pendingInit";
    }
    if (["running", "working", "active"].includes(key)) return "running";
    if (["completed", "complete", "done"].includes(key)) return "completed";
    if (["shutdown", "closed"].includes(key)) return "shutdown";
    if (["interrupted", "aborted", "cancelled", "canceled"].includes(key)) {
      return "interrupted";
    }
    if (["errored", "error", "failed"].includes(key)) return "errored";
    if (["notfound", "missing"].includes(key)) return "notFound";
    return "pendingInit";
  }

  function spawnPhase(status) {
    switch (normalizeSpawnStatus(status)) {
      case "running":
        return "working";
      case "completed":
      case "interrupted":
      case "shutdown":
        return "done";
      case "errored":
      case "notFound":
        return "failed";
      default:
        return "waiting";
    }
  }

  function spawnStatusRank(status) {
    const phase = spawnPhase(status);
    if (phase === "done" || phase === "failed") return 2;
    return phase === "working" ? 1 : 0;
  }

  function mergeSpawnTask(task, previous, now = Date.now()) {
    const incomingStatus = normalizeSpawnStatus(task?.status);
    const previousStatus = previous ? normalizeSpawnStatus(previous.status) : null;
    const status =
      previousStatus && (
        spawnStatusRank(previousStatus) === 2 ||
        spawnStatusRank(incomingStatus) < spawnStatusRank(previousStatus)
      )
        ? previousStatus
        : incomingStatus;
    const phase = spawnPhase(status);
    const observedAtMs = normalizeTimestamp(previous?.observedAtMs) ?? now;
    const startedAtMs =
      normalizeTimestamp(previous?.startedAtMs) ??
      (phase === "working" ? now : null);
    const completedAtMs =
      normalizeTimestamp(previous?.completedAtMs) ??
      (phase === "done" || phase === "failed" ? now : null);
    return {
      ...task,
      status,
      observedAtMs,
      startedAtMs,
      completedAtMs,
    };
  }

  function friendlySpawnName(summary) {
    const compact = String(summary || "").replace(/\s+/g, " ").trim();
    if (!compact) return "";
    return compact.length <= 72 ? compact : `${compact.slice(0, 71).trimEnd()}…`;
  }

  function setSpawnThreadName(hostId, task) {
    const threadId = normalizeThreadId(task?.threadId);
    const name = friendlySpawnName(task?.summary);
    if (!threadId || !name) {
      return Promise.reject(new Error("Spawn thread name metadata is incomplete"));
    }
    const targetHostId = typeof hostId === "string" && hostId
      ? hostId
      : activeThreadHostId() ?? "local";
    return sendAppServerRequest(targetHostId, "thread/name/set", {
      threadId,
      name,
    });
  }

  function nameSpawnThread(hostId, task) {
    const threadId = normalizeThreadId(task?.threadId);
    if (!threadId || !friendlySpawnName(task?.summary)) return false;
    const targetHostId = typeof hostId === "string" && hostId
      ? hostId
      : activeThreadHostId() ?? "local";
    const key = `${targetHostId}:${threadId}`;
    if (
      state.namedSpawnThreads.has(key) ||
      state.namingSpawnThreads.has(key)
    ) {
      return false;
    }
    state.namingSpawnThreads.add(key);
    void setSpawnThreadName(targetHostId, task)
      .then(() => {
        state.namingSpawnThreads.delete(key);
        state.namedSpawnThreads.add(key);
      })
      .catch(() => {
        state.namingSpawnThreads.delete(key);
      });
    return true;
  }

  function rememberSpawn(progress, hostId = null) {
    if (
      !progress ||
      typeof progress.threadId !== "string" ||
      typeof progress.callId !== "string" ||
      !Array.isArray(progress.tasks)
    ) {
      return false;
    }
    const threadId = normalizeThreadId(progress.threadId);
    if (!threadId) return false;
    let threadSpawns = state.spawns.get(threadId);
    if (!threadSpawns) {
      threadSpawns = new Map();
      state.spawns.set(threadId, threadSpawns);
    }
    const previous = threadSpawns.get(progress.callId);
    const previousTasks = new Map(
      (previous?.tasks ?? []).map((task) => [Number(task.ordinal), task]),
    );
    const now = Date.now();
    const normalized = {
      ...progress,
      tasks: progress.tasks.map((task) =>
        mergeSpawnTask(task, previousTasks.get(Number(task.ordinal)), now)),
    };
    threadSpawns.set(progress.callId, normalized);
    for (const task of normalized.tasks) nameSpawnThread(hostId, task);
    if (threadId === state.activeThreadId) scheduleNativeSubagentLabelSync(4);
    return true;
  }

  function activePath(snapshot, byId) {
    const path = new Set();
    let current = snapshot.activeNodeId;
    while (current && !path.has(current)) {
      path.add(current);
      current = byId.get(current)?.parentId ?? null;
    }
    return path;
  }

  function nodeVisual(node, active, hasChildren) {
    if (active || node.status === "live") return ["running", "live"];
    if (node.spawnOutcome === "errored") return ["error", "error"];
    if (node.spawnOutcome === "aborted") return ["warning", "warning"];
    if (node.spawnOutcome === "completed" || node.status === "closed") return ["check", "done"];
    if (node.status === "compacted") return ["history", "muted"];
    return hasChildren ? ["branch", "muted"] : ["idle", "muted"];
  }

  function nodeLabel(node, active) {
    const summary = typeof node.summary === "string" ? node.summary.trim() : "";
    if (summary) return summary;
    if (active || node.status === "live") return t("task.current");
    if (node.status === "closed") return t("task.completed");
    if (node.status === "compacted") return t("task.previous");
    return t("task.generic");
  }

  function mergeBuckets(items, scopeKey) {
    const merged = [];
    for (const item of items) {
      const previous = merged[merged.length - 1];
      if (item.kind === "bucket" && previous?.kind === "bucket") {
        previous.nodes.push(...item.nodes);
      } else {
        merged.push(item.kind === "bucket"
          ? { kind: "bucket", nodes: [...item.nodes] }
          : item);
      }
    }
    return merged.map((item) => {
      if (item.kind !== "bucket") return item;
      const first = item.nodes[0]?.nodeId ?? "none";
      const last = item.nodes[item.nodes.length - 1]?.nodeId ?? first;
      return {
        ...item,
        count: item.nodes.length,
        bucketKey: `${scopeKey}:${first}:${last}`,
      };
    });
  }

  function materializeBuckets(items) {
    return items.flatMap((item) => {
      if (item.kind !== "bucket") return [item];
      if (!state.expandedBuckets.has(item.bucketKey)) {
        return [{ ...item, expanded: false }];
      }
      return [
        { ...item, expanded: true },
        ...item.nodes.map((node) => ({ kind: "node", node })),
      ];
    });
  }

  function siblingItems(nodes, path, scopeKey) {
    const items = nodes.map((node) => {
      const summary = typeof node.summary === "string" ? node.summary.trim() : "";
      const complete = node.status === "closed" || node.status === "compacted";
      return complete && !summary && !path.has(node.nodeId)
        ? { kind: "bucket", nodes: [node] }
        : { kind: "node", node };
    });
    const activeIndex = nodes.findIndex((node) => path.has(node.nodeId));
    const visibleEnd = activeIndex < 0 ? nodes.length : activeIndex + 1;
    if (visibleEnd < nodes.length || nodes.length <= MAX_VISIBLE_SIBLINGS) {
      return materializeBuckets(mergeBuckets(items, scopeKey));
    }
    const visibleStart = Math.max(0, visibleEnd - MAX_VISIBLE_SIBLINGS);
    if (visibleStart === 0) {
      return materializeBuckets(mergeBuckets(items, scopeKey));
    }
    const hiddenNodes = items.slice(0, visibleStart).flatMap((item) =>
      item.kind === "bucket" ? item.nodes : [item.node]);
    return materializeBuckets(mergeBuckets([
      { kind: "bucket", nodes: hiddenNodes },
      ...items.slice(visibleStart, visibleEnd),
    ], scopeKey));
  }

  function projectSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.nodes)) return [];
    const byId = new Map(snapshot.nodes.map((node) => [node.nodeId, node]));
    const children = new Map();
    for (const node of snapshot.nodes) {
      const key = node.parentId ?? "";
      const siblings = children.get(key) ?? [];
      siblings.push(node);
      children.set(key, siblings);
    }
    for (const siblings of children.values()) {
      siblings.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
    }
    const path = activePath(snapshot, byId);
    const rows = [];

    function visibleTaskNodes(nodes) {
      const visible = [];
      for (const node of nodes) {
        const descendants = children.get(node.nodeId) ?? [];
        const active = node.nodeId === snapshot.activeNodeId;
        const summary = typeof node.summary === "string" ? node.summary.trim() : "";
        const complete = node.status === "closed" || node.status === "compacted";
        const elide =
          node.kind !== "root_epoch" &&
          descendants.length > 0 && !active && !summary && !complete;
        if (elide) visible.push(...visibleTaskNodes(descendants));
        else visible.push(node);
      }
      return visible;
    }

    function walk(nodes, ancestors, parentId) {
      const scopeKey = `${snapshot.threadId}:${parentId ?? "root"}`;
      const items = siblingItems(visibleTaskNodes(nodes), path, scopeKey);
      items.forEach((item, index) => {
        if (rows.length >= MAX_ROWS) return;
        const last = index === items.length - 1;
        if (item.kind === "bucket") {
          rows.push({
            key: `bucket:${item.bucketKey}`,
            kind: "bucket",
            bucketKey: item.bucketKey,
            expanded: item.expanded,
            count: item.count,
            icon: "history",
            tone: "muted",
            depth: ancestors.length,
            last,
            label: tp(
              item.expanded ? "branches.hide" : "branches.hidden",
              item.count,
            ),
          });
          return;
        }
        const node = item.node;
        const descendants = children.get(node.nodeId) ?? [];
        const active = node.nodeId === snapshot.activeNodeId;
        const subtreeKey = `${snapshot.threadId}:${node.nodeId}`;
        const [icon, tone] = nodeVisual(node, active, descendants.length > 0);
        const complete = node.status === "closed" || node.status === "compacted";
        const subtreeCollapsed =
          descendants.length > 0 &&
          complete &&
          !path.has(node.nodeId) &&
          !state.expandedSubtrees.has(subtreeKey);
        rows.push({
          key: `node:${node.nodeId}`,
          kind: "node",
          nodeId: node.nodeId,
          node,
          childCount: descendants.length,
          subtreeKey,
          subtreeCollapsed,
          icon,
          tone,
          depth: ancestors.length,
          last,
          label: nodeLabel(node, active),
          active,
        });
        if (active) appendSpawnRows(rows, snapshot.threadId, [...ancestors, last]);
        if (!subtreeCollapsed) {
          walk(descendants, [...ancestors, last], node.nodeId);
        }
      });
    }

    function taskCountBelow(nodeId) {
      let count = 0;
      const pending = [...(children.get(nodeId) ?? [])];
      while (pending.length) {
        const node = pending.pop();
        if (!node) continue;
        if (node.kind !== "root_epoch") count += 1;
        pending.push(...(children.get(node.nodeId) ?? []));
      }
      return count;
    }

    const roots = children.get("") ?? [];
    const epochs = roots.filter((node) => node.kind === "root_epoch");
    const looseTasks = roots.filter((node) => node.kind !== "root_epoch");
    const currentEpoch =
      epochs.find((epoch) => path.has(epoch.nodeId)) ??
      epochs.at(-1) ??
      null;
    const historicalEpochs = epochs.filter((epoch) => epoch !== currentEpoch);
    if (historicalEpochs.length && rows.length < MAX_ROWS) {
      const epochKey = `${snapshot.threadId}:context-history`;
      const expanded = state.expandedEpochs.has(epochKey);
      const compactionCount =
        historicalEpochs.filter((epoch) => epoch.status === "compacted").length ||
        historicalEpochs.length;
      rows.push({
        key: "context-history",
        kind: "context-history",
        epochKey,
        expanded,
        icon: "history",
        tone: "muted",
        depth: 0,
        last: currentEpoch == null && looseTasks.length === 0,
        label: t("context.earlier"),
        meta: tp("context.compactions", compactionCount),
        compactionCount,
      });
      if (expanded) {
        historicalEpochs.forEach((epoch, index) => {
          if (rows.length >= MAX_ROWS) return;
          const contextEpochKey =
            `${snapshot.threadId}:context-epoch:${epoch.nodeId}`;
          const contextEpochExpanded = state.expandedEpochs.has(contextEpochKey);
          const contextEpochLast = index === historicalEpochs.length - 1;
          const taskCount = taskCountBelow(epoch.nodeId);
          const compactionNumber = Math.max(1, roots.indexOf(epoch) + 1);
          rows.push({
            key: `context-epoch:${epoch.nodeId}`,
            kind: "context-epoch",
            epochKey: contextEpochKey,
            epochNodeId: epoch.nodeId,
            expanded: contextEpochExpanded,
            icon: "compact",
            tone: "muted",
            depth: 1,
            last: contextEpochLast,
            label: t("context.beforeCompaction", {
              count: formatInteger(compactionNumber),
            }),
            meta: tp("context.nodes", taskCount),
            compactionNumber,
            taskCount,
          });
          if (!contextEpochExpanded || rows.length >= MAX_ROWS) return;
          const epochChildren = children.get(epoch.nodeId) ?? [];
          walk(epochChildren, [false, contextEpochLast], epoch.nodeId);
          if (snapshot.activeNodeId === epoch.nodeId) {
            appendSpawnRows(rows, snapshot.threadId, [false, contextEpochLast]);
          }
        });
      }
    }
    if (currentEpoch && rows.length < MAX_ROWS) {
      const epochChildren = children.get(currentEpoch.nodeId) ?? [];
      walk(epochChildren, [], currentEpoch.nodeId);
      if (snapshot.activeNodeId === currentEpoch.nodeId) {
        appendSpawnRows(rows, snapshot.threadId, []);
      }
    }
    if (looseTasks.length && rows.length < MAX_ROWS) {
      walk(looseTasks, [], null);
    }
    if (rows.length === MAX_ROWS) {
      rows.push({
        key: "limit",
        kind: "limit",
        icon: "more",
        tone: "muted",
        depth: 0,
        last: true,
        label: t("context.additionalHidden"),
      });
    }
    return rows;
  }

  function appendSpawnRows(rows, threadId, ancestors) {
    for (const progress of state.spawns.get(normalizeThreadId(threadId))?.values() ?? []) {
      progress.tasks.forEach((task, index) => {
        if (rows.length >= MAX_ROWS) return;
        const visual = spawnVisual(task.status);
        rows.push({
          key: `spawn:${progress.callId}:${task.ordinal}`,
          kind: "spawn",
          spawnTask: {
            callId: progress.callId,
            ordinal: task.ordinal,
            threadId: task.threadId ?? null,
            agentPath: task.agentPath ?? null,
            status: task.status,
            summary: task.summary ?? null,
            observedAtMs: task.observedAtMs ?? null,
            startedAtMs: task.startedAtMs ?? null,
            completedAtMs: task.completedAtMs ?? null,
          },
          icon: visual.icon,
          tone: visual.tone,
          depth: ancestors.length,
          last: index === progress.tasks.length - 1,
          label: task.summary || t("spawn.parallelTask", {
            count: formatInteger(Number(task.ordinal) + 1),
          }),
          meta: spawnStatusLabel(task.status),
        });
      });
    }
  }

  function resolveWorkspaceDetailItem(snapshot, rowKey, projected = null) {
    if (!snapshot || !Array.isArray(snapshot.nodes) || typeof rowKey !== "string") {
      return null;
    }
    const visible = (projected ?? projectSnapshot(snapshot))
      .find((item) =>
        item.key === rowKey && (item.kind === "node" || item.kind === "spawn"));
    if (visible) return visible;

    if (rowKey.startsWith("node:")) {
      const nodeId = rowKey.slice("node:".length);
      const node = snapshot.nodes.find((candidate) => candidate.nodeId === nodeId);
      if (!node || node.kind === "root_epoch") return null;
      const descendants = snapshot.nodes.filter((candidate) =>
        candidate.parentId === node.nodeId);
      const byId = new Map(snapshot.nodes.map((candidate) =>
        [candidate.nodeId, candidate]));
      const path = activePath(snapshot, byId);
      const active = node.nodeId === snapshot.activeNodeId;
      const subtreeKey = `${snapshot.threadId}:${node.nodeId}`;
      const complete = node.status === "closed" || node.status === "compacted";
      const [icon, tone] = nodeVisual(node, active, descendants.length > 0);
      return {
        key: rowKey,
        kind: "node",
        nodeId: node.nodeId,
        node,
        childCount: descendants.length,
        subtreeKey,
        subtreeCollapsed:
          descendants.length > 0 &&
          complete &&
          !path.has(node.nodeId) &&
          !state.expandedSubtrees.has(subtreeKey),
        icon,
        tone,
        label: nodeLabel(node, active),
        active,
        hiddenFromTree: true,
      };
    }

    if (rowKey.startsWith("spawn:")) {
      for (const progress of state.spawns
        .get(normalizeThreadId(snapshot.threadId))?.values() ?? []) {
        for (const task of progress.tasks) {
          if (`spawn:${progress.callId}:${task.ordinal}` !== rowKey) continue;
          const visual = spawnVisual(task.status);
          return {
            key: rowKey,
            kind: "spawn",
            spawnTask: {
              callId: progress.callId,
              ordinal: task.ordinal,
              threadId: task.threadId ?? null,
              agentPath: task.agentPath ?? null,
              status: task.status,
              summary: task.summary ?? null,
              observedAtMs: task.observedAtMs ?? null,
              startedAtMs: task.startedAtMs ?? null,
              completedAtMs: task.completedAtMs ?? null,
            },
            icon: visual.icon,
            tone: visual.tone,
            label: task.summary || t("spawn.parallelTask", {
              count: formatInteger(Number(task.ordinal) + 1),
            }),
            meta: spawnStatusLabel(task.status),
            hiddenFromTree: true,
          };
        }
      }
    }
    return null;
  }

  function nodeDetailModel(snapshot, nodeId) {
    if (!snapshot || !Array.isArray(snapshot.nodes)) return null;
    const byId = new Map(snapshot.nodes.map((node) => [node.nodeId, node]));
    const node = byId.get(nodeId);
    if (!node) return null;
    const path = [];
    const seen = new Set();
    let current = node;
    while (current && !seen.has(current.nodeId)) {
      seen.add(current.nodeId);
      path.push(current.nodeId);
      current = current.parentId ? byId.get(current.parentId) : null;
    }
    path.reverse();
    return {
      nodeId: node.nodeId,
      parentId: node.parentId ?? null,
      kind: node.kind,
      status: node.status,
      summary: typeof node.summary === "string" ? node.summary.trim() : "",
      memorySummary:
        typeof node.memorySummary === "string" ? node.memorySummary.trim() : "",
      memorySummaryTruncated: node.memorySummaryTruncated === true,
      spawnOutcome: node.spawnOutcome ?? null,
      spawnLink: normalizeSpawnLink(node.spawnLink),
      start: node.start ?? null,
      end: node.end ?? null,
      contextPressure: node.contextPressure ?? null,
      childCount: snapshot.nodes.filter((candidate) =>
        candidate.parentId === node.nodeId).length,
      path,
      active: snapshot.activeNodeId === node.nodeId,
    };
  }

  function nodeStatusLabel(detail) {
    if (detail.active || detail.status === "live") return t("status.running");
    if (detail.spawnOutcome === "errored") return t("status.failed");
    if (detail.spawnOutcome === "aborted") return t("status.aborted");
    if (detail.status === "closed") return t("status.completed");
    if (detail.status === "compacted") return t("status.compacted");
    return t("status.opened");
  }

  function contextLocationLabel(snapshot, detail) {
    if (!snapshot || !detail?.path?.length) {
      return t("context.current");
    }
    const roots = snapshot.nodes
      .filter((node) => node.kind === "root_epoch" && node.parentId == null)
      .sort((left, right) => (left.start ?? 0) - (right.start ?? 0));
    if (!roots.length) return t("context.current");
    const byId = new Map(snapshot.nodes.map((node) => [node.nodeId, node]));
    let activeRoot = byId.get(snapshot.activeNodeId);
    const seen = new Set();
    while (activeRoot?.parentId && !seen.has(activeRoot.nodeId)) {
      seen.add(activeRoot.nodeId);
      activeRoot = byId.get(activeRoot.parentId);
    }
    if (activeRoot?.kind !== "root_epoch") activeRoot = roots.at(-1);
    const rootId = detail.path[0];
    if (rootId === activeRoot?.nodeId) {
      return t("context.current");
    }
    const index = roots.findIndex((root) => root.nodeId === rootId);
    const activeIndex = roots.findIndex((root) => root.nodeId === activeRoot?.nodeId);
    if (index >= 0 && (activeIndex < 0 || index < activeIndex)) {
      return t("context.beforeCompaction", {
        count: formatInteger(index + 1),
      });
    }
    return t("context.earlier");
  }

  function spawnStatusLabel(status) {
    const normalized = normalizeSpawnStatus(status);
    const keys = {
      pendingInit: "spawnStatus.starting",
      running: "spawnStatus.working",
      completed: "spawnStatus.completed",
      shutdown: "spawnStatus.finished",
      errored: "spawnStatus.failed",
      interrupted: "spawnStatus.interrupted",
      notFound: "spawnStatus.notFound",
    };
    return t(keys[normalized] ?? "spawnStatus.unknown");
  }

  function spawnVisual(status) {
    switch (normalizeSpawnStatus(status)) {
      case "running":
        return { icon: "running", tone: "live" };
      case "completed":
      case "shutdown":
        return { icon: "check", tone: "done" };
      case "interrupted":
        return { icon: "warning", tone: "warning" };
      case "errored":
      case "notFound":
        return { icon: "error", tone: "error" };
      default:
        return { icon: "idle", tone: "muted" };
    }
  }

  function formatDuration(milliseconds) {
    const value = Number(milliseconds);
    if (!Number.isFinite(value) || value < 0) return null;
    const seconds = Math.max(0, Math.round(value / 1_000));
    const unit = (amount, name) => {
      try {
        return new Intl.NumberFormat(state.locale, {
          style: "unit",
          unit: name,
          unitDisplay: "narrow",
          maximumFractionDigits: 0,
        }).format(amount);
      } catch {
        return `${formatInteger(amount)} ${name}`;
      }
    };
    if (seconds < 60) return unit(seconds, "second");
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    if (minutes < 60) {
      return [unit(minutes, "minute"), remainder ? unit(remainder, "second") : ""]
        .filter(Boolean)
        .join(" ");
    }
    const hours = Math.floor(minutes / 60);
    const minuteRemainder = minutes % 60;
    return [unit(hours, "hour"), minuteRemainder ? unit(minuteRemainder, "minute") : ""]
      .filter(Boolean)
      .join(" ");
  }

  function spawnTimingText(task, now = Date.now()) {
    if (!task) return null;
    const observedAtMs = normalizeTimestamp(task.observedAtMs);
    const startedAtMs = normalizeTimestamp(task.startedAtMs);
    const completedAtMs = normalizeTimestamp(task.completedAtMs);
    const phase = spawnPhase(task.status);
    if (phase === "waiting") {
      if (!observedAtMs) return null;
      const waiting = formatDuration(Math.max(0, now - observedAtMs));
      return waiting ? t("timing.waiting", { duration: waiting }) : null;
    }
    const start = startedAtMs;
    const end = completedAtMs ?? now;
    if (!start || end < start) return null;
    const duration = formatDuration(end - start);
    if (!duration) return null;
    if (phase === "working") {
      return t("timing.running", { duration });
    }
    return t("timing.ran", { duration });
  }

  function formatClockTime(value) {
    const timestamp = normalizeTimestamp(value);
    if (!timestamp) return null;
    try {
      return new Intl.DateTimeFormat(state.locale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).format(new Date(timestamp));
    } catch {
      return new Date(timestamp).toLocaleTimeString();
    }
  }

  function spawnTimingDetail(task, now = Date.now()) {
    const duration = spawnTimingText(task, now);
    const started = formatClockTime(task?.startedAtMs);
    if (!duration || !started) return duration;
    const phase = spawnPhase(task?.status);
    const completed = formatClockTime(task?.completedAtMs);
    const end = phase === "working"
      ? t("timing.now")
      : completed;
    return end ? `${started} → ${end} · ${duration}` : duration;
  }

  function formatTokenCount(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return null;
    try {
      return new Intl.NumberFormat(state.locale, {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(numeric);
    } catch {
      return String(Math.round(numeric));
    }
  }

  function contextPressureText(pressure) {
    if (!pressure) return null;
    const context = formatTokenCount(pressure.contextTokens);
    const open = formatTokenCount(pressure.openInputTokens);
    const current = formatTokenCount(pressure.currentInputTokens);
    if (context) {
      const range = open && current
        ? ` (${open} → ${current})`
        : "";
      return t("pressure.added", { context, range });
    }
    const problems = {
      missing_current_usage: t("pressure.missingCurrent"),
      missing_open_context_baseline: t("pressure.missingBaseline"),
      coordinate_mismatch: t("pressure.coordinateMismatch"),
    };
    return problems[pressure.problem] ??
      t("pressure.unavailable");
  }

  function createDetailSection(label, text, extraClass = "") {
    const section = document.createElement("div");
    section.className = `detail-section${extraClass ? ` ${extraClass}` : ""}`;
    const heading = document.createElement("div");
    heading.className = "detail-label";
    heading.textContent = label;
    const body = document.createElement("div");
    body.className = "detail-text";
    body.textContent = text;
    section.append(heading, body);
    return section;
  }

  function createDetailAction(label, action, value = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "detail-action";
    button.dataset.spineAction = action;
    if (value) button.dataset.value = value;
    const icon = action === "toggle-subtree"
      ? '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="5.5" cy="5" r="1.4"/><circle cx="14.5" cy="8" r="1.4"/><circle cx="14.5" cy="15" r="1.4"/><path d="M5.5 6.4v3.1a5.5 5.5 0 0 0 5.5 5.5h2.1M5.5 8.8h5.6A3.4 3.4 0 0 0 13.1 8"/></svg>'
      : action === "open-child-agent"
        ? '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="6.1" cy="10" r="2.1"/><circle cx="13.9" cy="5.8" r="2.1"/><circle cx="13.9" cy="14.2" r="2.1"/><path d="M8 9.05l3.95-2.15M8 10.95l3.95 2.15"/></svg>'
        : '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="6.25" y="6.25" width="9" height="9" rx="2"/><path d="M13.2 6.2V5.3A1.55 1.55 0 0 0 11.65 3.75H5.3A1.55 1.55 0 0 0 3.75 5.3v6.35A1.55 1.55 0 0 0 5.3 13.2h.9"/></svg>';
    button.innerHTML = `${icon}<span></span>`;
    button.lastElementChild.textContent = label;
    return button;
  }

  function nativeSpawnTaskTitle(callId, ordinal) {
    const fragment = nativeSpawnTaskIdentity(callId).fragment;
    return `Spawn ${fragment} ${Number(ordinal)}`;
  }

  function nativeSpawnTaskIdentity(callId, ordinal = null) {
    const fragment = String(callId || "")
      .split("")
      .filter((character) => /^[a-z0-9]$/i.test(character))
      .join("")
      .toLowerCase()
      .slice(0, 20) || "call";
    return {
      fragment,
      ordinal: ordinal == null ? null : Number(ordinal),
    };
  }

  function comparableText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function nativeSubagentRows() {
    const rows = [];
    for (const button of document.querySelectorAll("button")) {
      if (button.matches('[data-slot="thread-summary-panel-item-button"]')) continue;
      const rect = button.getBoundingClientRect();
      if (
        !button.isConnected ||
        rect.width <= 0 ||
        rect.height <= 0
      ) {
        continue;
      }
      const leafTexts = [...button.querySelectorAll("span")]
        .filter((span) => !span.children.length)
        .map((span) => comparableText(span.textContent))
        .filter(Boolean);
      if (
        !button.querySelector(":scope > img[aria-hidden='true']")
      ) {
        continue;
      }
      rows.push({ button, leafTexts });
    }
    return rows;
  }

  function nativeSubagentOverviewRoot() {
    const groups = [...new Set(
      nativeSubagentRows()
        .map(({ button }) =>
          button.closest?.(
            '[data-slot="thread-summary-panel-item-group"]',
          ))
        .filter(Boolean),
    )];
    if (!groups.length) return null;
    const first = groups[0];
    const candidates = [
      first.parentElement?.parentElement,
      first.parentElement,
      first,
    ].filter(Boolean);
    return candidates.find((candidate) => {
      if (!groups.every((group) => candidate.contains(group))) return false;
      const rect = candidate.getBoundingClientRect();
      return (
        candidate.isConnected &&
        rect.width > 0 &&
        rect.height > 0
      );
    }) ?? null;
  }

  function findNativeSubagentButton(target) {
    const rows = nativeSubagentRows();
    const identity = target?.callId != null
      ? nativeSpawnTaskIdentity(target.callId, target.ordinal)
      : null;
    if (identity && Number.isInteger(identity.ordinal)) {
      const structuredKey = `${identity.fragment}:${identity.ordinal}`;
      const matches = [...document.querySelectorAll("button")]
        .filter((button) => {
          if (
            !button.isConnected ||
            button.matches('[data-slot="thread-summary-panel-item-button"]')
          ) {
            return false;
          }
          const rect = button.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .filter((button) =>
          button.dataset.spineSpawnKey === structuredKey ||
          [...button.querySelectorAll("span")]
            .filter((span) => !span.children.length)
            .map((span) => comparableText(span.textContent))
            .some((text) => {
              const lower = text.toLowerCase();
              if (!lower.includes(identity.fragment)) return false;
              const trailingOrdinal = lower.match(/(\d+)\s*$/)?.[1];
              return Number(trailingOrdinal) === identity.ordinal;
            })
        );
      if (matches.length === 1) return matches[0];
    }
    const preciseNames = [
      friendlySpawnName(target?.summary),
    ].map(comparableText).filter(Boolean);
    for (const name of preciseNames) {
      const matches = rows.filter(({ leafTexts }) => leafTexts.includes(name));
      if (matches.length === 1) return matches[0].button;
    }
    const result = comparableText(target?.resultSummary);
    if (result) {
      const matches = rows.filter(({ leafTexts }) =>
        leafTexts.some((text) => text === result)
      );
      if (matches.length === 1) return matches[0].button;
    }
    return null;
  }

  function knownSpawnTargets() {
    const targets = [];
    const seen = new Set();
    const append = (target) => {
      const link = normalizeSpawnLink(target);
      if (!link) return;
      const key = `${link.callId}:${link.ordinal}`;
      if (seen.has(key)) return;
      seen.add(key);
      targets.push(link);
    };
    for (const node of currentSnapshot()?.nodes ?? []) append(node.spawnLink);
    for (const progress of state.spawns
      .get(normalizeThreadId(state.activeThreadId))?.values() ?? []) {
      for (const task of progress.tasks ?? []) {
        append({
          callId: progress.callId,
          ordinal: task.ordinal,
          threadId: task.threadId,
          agentPath: task.agentPath,
          summary: task.summary,
        });
      }
    }
    return targets;
  }

  function syncNativeSubagentLabel(target) {
    const name = friendlySpawnName(target?.summary);
    const button = findNativeSubagentButton(target);
    if (!name || !button || target?.callId == null) return false;
    const identity = nativeSpawnTaskIdentity(target.callId, target.ordinal);
    const title = [...button.querySelectorAll("span")]
      .filter((span) => !span.children.length)
      .find((span) => {
        const text = comparableText(span.textContent);
        if (text === name) return true;
        const lower = text.toLowerCase();
        return (
          lower.includes(identity.fragment) &&
          Number(lower.match(/(\d+)\s*$/)?.[1]) === identity.ordinal
        );
      });
    if (!title) return false;
    button.dataset.spineSpawnKey = `${identity.fragment}:${identity.ordinal}`;
    if (comparableText(title.textContent) === name) return false;
    title.textContent = name;
    return true;
  }

  function findNativeSubagentDetailTitle(target) {
    if (target?.callId == null) return null;
    const identity = nativeSpawnTaskIdentity(target.callId, target.ordinal);
    if (!Number.isInteger(identity.ordinal)) return null;
    const structuredKey = `${identity.fragment}:${identity.ordinal}`;
    const nativeTitle = comparableText(
      nativeSpawnTaskTitle(target.callId, target.ordinal),
    ).toLowerCase();
    const matches = [...document.querySelectorAll("span")]
      .filter((span) => {
        if (!span.isConnected || span.children.length) return false;
        const header = span.parentElement;
        if (
          !header?.querySelector(":scope > button") ||
          !header.querySelector(":scope > img[aria-hidden='true']")
        ) {
          return false;
        }
        const headerRect = header.getBoundingClientRect();
        const titleRect = span.getBoundingClientRect();
        return (
          headerRect.width > 0 &&
          headerRect.height > 0 &&
          headerRect.top >= 0 &&
          headerRect.top < 100 &&
          titleRect.width > 0 &&
          titleRect.height > 0
        );
      })
      .filter((span) =>
        span.dataset.spineSpawnDetailKey === structuredKey ||
        comparableText(span.textContent).toLowerCase() === nativeTitle
      );
    return matches.length === 1 ? matches[0] : null;
  }

  function syncNativeSubagentDetailTitle(target) {
    const name = friendlySpawnName(target?.summary);
    const title = findNativeSubagentDetailTitle(target);
    if (!name || !title || target?.callId == null) return false;
    const identity = nativeSpawnTaskIdentity(target.callId, target.ordinal);
    title.dataset.spineSpawnDetailKey =
      `${identity.fragment}:${identity.ordinal}`;
    if (comparableText(title.textContent) === name) return false;
    title.textContent = name;
    return true;
  }

  function syncNativeSubagentLabels() {
    let changed = 0;
    for (const target of knownSpawnTargets()) {
      if (syncNativeSubagentLabel(target)) changed += 1;
      if (syncNativeSubagentDetailTitle(target)) changed += 1;
    }
    return changed;
  }

  function stopNativeSubagentListObserver() {
    state.subagentListObserver?.disconnect();
    state.subagentListObserver = null;
    state.subagentListRoot = null;
    state.subagentListSyncQueued = false;
  }

  function connectNativeSubagentListObserver() {
    if (typeof MutationObserver !== "function") return false;
    const root = nativeSubagentOverviewRoot();
    if (!root) {
      if (state.subagentListRoot && !state.subagentListRoot.isConnected) {
        stopNativeSubagentListObserver();
      }
      return false;
    }
    if (
      state.subagentListObserver &&
      state.subagentListRoot === root
    ) {
      return true;
    }
    stopNativeSubagentListObserver();
    state.subagentListRoot = root;
    state.subagentListObserver = new MutationObserver(() => {
      if (state.subagentListSyncQueued) return;
      state.subagentListSyncQueued = true;
      queueMicrotask(() => {
        state.subagentListSyncQueued = false;
        if (
          state.destroyed ||
          !state.subagentListRoot?.isConnected
        ) {
          stopNativeSubagentListObserver();
          return;
        }
        syncNativeSubagentLabels();
      });
    });
    state.subagentListObserver.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    return true;
  }

  function stopNativeSubagentTitleHook() {
    state.subagentTitleObserver?.disconnect();
    state.subagentTitleObserver = null;
    if (state.subagentTitleTimeout) clearTimeout(state.subagentTitleTimeout);
    if (state.subagentTitleSettleTimer) {
      clearTimeout(state.subagentTitleSettleTimer);
    }
    state.subagentTitleTimeout = 0;
    state.subagentTitleSettleTimer = 0;
  }

  function armNativeSubagentTitleHook(target, timeoutMs = 5_000) {
    stopNativeSubagentTitleHook();
    // Codex mounts the child-agent detail surface as a sibling of the main
    // thread, not inside it. Observe the renderer root only for this bounded
    // navigation window so the title is rewritten in React's creation
    // checkpoint, before the next paint.
    const root = document.body;
    if (!root || typeof MutationObserver !== "function") {
      return syncNativeSubagentDetailTitle(target);
    }
    let matched = false;
    const check = () => {
      const title = findNativeSubagentDetailTitle(target);
      if (!title) return false;
      syncNativeSubagentDetailTitle(target);
      if (!matched) {
        matched = true;
        state.subagentTitleSettleTimer = setTimeout(
          stopNativeSubagentTitleHook,
          900,
        );
      }
      return true;
    };
    state.subagentTitleObserver = new MutationObserver(check);
    state.subagentTitleObserver.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    state.subagentTitleTimeout = setTimeout(
      stopNativeSubagentTitleHook,
      timeoutMs,
    );
    check();
    return true;
  }

  function scheduleNativeSubagentLabelSync(attempts = 18) {
    if (state.destroyed || !document.body) return;
    state.subagentLabelAttempts = Math.max(state.subagentLabelAttempts, attempts);
    if (state.subagentLabelFrame) return;
    const attempt = () => {
      state.subagentLabelFrame = 0;
      const changed = syncNativeSubagentLabels();
      const listObserved = connectNativeSubagentListObserver();
      if (listObserved || changed > 0) {
        state.subagentLabelAttempts = 0;
        return;
      }
      state.subagentLabelAttempts -= 1;
      if (state.subagentLabelAttempts > 0) {
        state.subagentLabelFrame = requestAnimationFrame(attempt);
      }
    };
    state.subagentLabelFrame = requestAnimationFrame(attempt);
  }

  function childAgentSummaryButton() {
    return [...document.querySelectorAll(
      'button[data-slot="thread-summary-panel-item-button"]',
    )].find((button) => {
      const rect = button.getBoundingClientRect();
      return (
        button.isConnected &&
        rect.width > 0 &&
        rect.height > 0 &&
        Boolean(button.querySelector(
          '[data-slot="thread-summary-panel-item-avatar-group"]',
        ))
      );
    }) ?? null;
  }

  function waitForNativeSubagentButton(target, timeoutMs = 5_000) {
    const immediate = findNativeSubagentButton(target);
    if (immediate || !document.body) return Promise.resolve(immediate);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (button) => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        clearTimeout(timeout);
        resolve(button);
      };
      const check = () => {
        const button = findNativeSubagentButton(target);
        if (button) finish(button);
      };
      const observer = new MutationObserver(check);
      const timeout = setTimeout(() => finish(null), timeoutMs);
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
      });
      check();
    });
  }

  function nativeThreadRow(threadId) {
    const normalized = normalizeThreadId(threadId);
    if (!normalized) return null;
    return [...document.querySelectorAll("[data-app-action-sidebar-thread-id]")]
      .find((element) =>
        normalizeThreadId(
          element.getAttribute("data-app-action-sidebar-thread-id"),
        ) === normalized
      ) ?? null;
  }

  function setDetailActionFeedback(control, message, durationMs = 1_800) {
    const label = control?.querySelector?.("span");
    if (!label) return;
    const previous = label.textContent;
    label.textContent = message;
    setTimeout(() => {
      if (label.isConnected) label.textContent = previous;
    }, durationMs);
  }

  async function openNativeSubagent(target, control = null) {
    if (control?.disabled) return false;
    if (control) control.disabled = true;
    const parentThreadId = normalizeThreadId(state.activeThreadId);
    let openedOverview = false;
    try {
      let button = findNativeSubagentButton(target);
      if (!button && nativeSubagentRows().length === 0) {
        const summaryButton = childAgentSummaryButton();
        if (summaryButton) {
          summaryButton.click();
          openedOverview = true;
        }
      }
      if (!button) button = await waitForNativeSubagentButton(target);
      if (
        state.destroyed ||
        normalizeThreadId(state.activeThreadId) !== parentThreadId
      ) {
        return false;
      }
      if (!button) {
        if (openedOverview) nativeThreadRow(parentThreadId)?.click();
        setDetailActionFeedback(
          control,
          t("feedback.subagentNotReady"),
        );
        return false;
      }
      syncNativeSubagentLabel(target);
      armNativeSubagentTitleHook(target);
      stopNativeSubagentListObserver();
      button.click();
      scheduleNativeSubagentLabelSync(24);
      requestAnimationFrame(() => {
        if (!state.destroyed) {
          closeWorkspaceDetail(true, true);
          handleThreadSelection();
        }
      });
      return true;
    } finally {
      if (control?.isConnected) control.disabled = false;
    }
  }

  function workspaceSidebarToggle() {
    return [...document.querySelectorAll("button")]
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        return (
          /^(?:true|false)$/.test(button.getAttribute("aria-pressed") ?? "") &&
          Boolean(button.querySelector("svg")) &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.top >= 0 &&
          rect.top < 64 &&
          rect.left > innerWidth * 0.5
        );
      })
      .sort((left, right) =>
        right.getBoundingClientRect().left - left.getBoundingClientRect().left)[0] ?? null;
  }

  function workspacePaneCandidate() {
    return [...document.querySelectorAll('[data-app-shell-tabs="true"]')]
      .filter((pane) =>
        pane.querySelector('[data-app-shell-tab-strip-controller="right"]'))
      .filter((pane) => {
        const rect = pane.getBoundingClientRect();
        return rect.width >= 240 && rect.height >= 240;
      })
      .sort((left, right) =>
        right.getBoundingClientRect().right -
        left.getBoundingClientRect().right)[0] ?? null;
  }

  function workspacePaneLayout(pane) {
    if (!pane?.isConnected) return null;
    const rect = pane.getBoundingClientRect();
    const shell = pane.closest('[data-app-shell-focus-area="right-panel"]');
    const shellRect = shell?.getBoundingClientRect();
    const shellStyle = shell ? getComputedStyle(shell) : null;
    const opacity = Number(shellStyle?.opacity ?? 1);
    const viewportWidth = document.documentElement.clientWidth || innerWidth;
    const viewportHeight = document.documentElement.clientHeight || innerHeight;
    const shellWideEnough =
      !shellRect || shellRect.width >= Math.min(240, rect.width * 0.75);
    const insideViewport =
      rect.left >= -1 &&
      rect.right <= viewportWidth + 1 &&
      rect.top >= -1 &&
      rect.bottom <= viewportHeight + 1;
    const ready =
      rect.width >= 240 &&
      rect.height >= 240 &&
      shellWideEnough &&
      insideViewport &&
      opacity >= 0.95 &&
      shellStyle?.visibility !== "hidden";
    const collapsed =
      !shell ||
      shellRect.width <= 4 ||
      opacity <= 0.05 ||
      rect.left >= viewportWidth - 2;
    return { pane, shell, rect, shellRect, opacity, ready, collapsed };
  }

  function workspacePane() {
    const candidate = workspacePaneCandidate();
    return workspacePaneLayout(candidate)?.ready ? candidate : null;
  }

  function resetWorkspacePaneReadiness() {
    state.detailPaneCandidate = null;
    state.detailPaneStableFrames = 0;
    state.detailPaneCollapsedFrames = 0;
    state.detailPaneLastMeasure = null;
  }

  function restoreWorkspaceDetailUi() {
    const ui = state.detailUi;
    if (!ui) return;
    ui.tabObserver?.disconnect();
    ui.tabStrip.removeEventListener("click", ui.onTabStripClick, true);
    if (ui.pane.isConnected) {
      ui.pane.removeAttribute("data-spine-detail-active");
    }
    if (ui.tabList.isConnected) {
      const nativeCount = [...ui.tabList.children].filter((element) =>
        element !== ui.tabHost &&
        element.matches?.('[data-app-shell-tab-controller="right"]')).length;
      ui.tabList.style.width =
        nativeCount === ui.originalNativeTabCount
          ? ui.originalTabListWidth
          : workspaceTabListWidth(ui.tabStrip, nativeCount);
    }
    ui.tabHost.remove();
    ui.host.remove();
    ui.nativeTabStyle.remove();
    state.detailUi = null;
  }

  function workspaceTabListWidth(tabStrip, count) {
    if (count <= 0) return "clamp(0px, 100% + 0px, 0px)";
    const reserved = Math.max(
      0,
      Math.round(parseFloat(getComputedStyle(tabStrip).scrollPaddingInlineEnd) || 0),
    );
    return `clamp(${90 * count}px, 100% - ${reserved}px, ${160 * count}px)`;
  }

  function syncWorkspaceTabList(ui) {
    if (!ui?.tabList.isConnected || state.detailUi !== ui) return;
    if (ui.tabHost.parentElement !== ui.tabList) ui.tabList.append(ui.tabHost);
    const nativeCount = [...ui.tabList.children].filter((element) =>
      element !== ui.tabHost &&
      element.matches?.('[data-app-shell-tab-controller="right"]')).length;
    const width = workspaceTabListWidth(ui.tabStrip, nativeCount + 1);
    if (ui.tabList.style.width !== width) ui.tabList.style.width = width;
  }

  function setWorkspaceDetailActive(active) {
    state.detailTabActive = Boolean(active);
    const ui = state.detailUi;
    if (!ui) return;
    ui.active = state.detailTabActive;
    ui.host.style.display = ui.active ? "block" : "none";
    ui.tabHost.dataset.active = String(ui.active);
    ui.tabRoot.querySelector(".label")
      ?.setAttribute("aria-selected", String(ui.active));
    ui.pane.toggleAttribute("data-spine-detail-active", ui.active);
  }

  function createWorkspaceDetailUi(pane) {
    restoreWorkspaceDetailUi();
    const tabStrip = pane.querySelector(
      '[data-app-shell-tab-strip-controller="right"]',
    );
    const tabList = tabStrip?.querySelector(':scope > [role="tablist"]');
    const header = tabStrip?.parentElement;
    if (!tabStrip || !tabList || !header) return null;

    const tabHost = document.createElement("div");
    tabHost.id = "spine-codex-workspace-tab";
    tabHost.dataset.appShellTabController = "right";
    tabHost.dataset.tabId = "spine-codex:detail";
    tabHost.style.cssText =
      "position:relative;display:flex;flex:1 1 0;min-width:90px;max-width:160px;height:28px;flex-shrink:0;align-items:center;overflow:hidden;padding-inline-end:4px;contain:content;pointer-events:auto;-webkit-app-region:no-drag;";
    const tabRoot = tabHost.attachShadow({ mode: "open" });
    tabRoot.innerHTML = `
      <style>
        :host { color: var(--color-token-text-primary, currentColor); font-family: inherit; }
        * { box-sizing: border-box; }
        button { font: inherit; }
        .bar { display: flex; width: 100%; height: 100%; min-width: 0; align-items: center; }
        .tab { position: relative; display: flex; width: 100%; height: 28px;
          min-width: 0; align-items: center; overflow: hidden; border-radius: 8px;
          padding: 4px 4px 4px 8px; background: transparent;
          transition: background-color var(--transition-duration-basic, .15s)
            var(--default-transition-timing-function, cubic-bezier(.4, 0, .2, 1));
          -webkit-app-region: no-drag; }
        :host([data-active="true"]) .tab { background: color-mix(in srgb,
          var(--color-token-foreground, currentColor) 5%,
          var(--color-token-main-surface-primary, transparent)); }
        .label { display: flex; min-width: 0; flex: 1; align-items: center; gap: 8px;
          border: 0; background: transparent; padding: 0; color: inherit; cursor: default;
          font-size: 14px; line-height: 20px; text-align: left;
          transition: scale var(--transition-duration-basic, .15s)
            var(--ease-out, cubic-bezier(0, 0, .2, 1)); }
        .label:active { scale: .98; }
        .icon { width: 16px; height: 16px; flex: 0 0 auto; }
        .icon svg { width: 16px; height: 16px; fill: none; stroke: currentColor;
          stroke-width: 1.35; stroke-linecap: round; stroke-linejoin: round; }
        .title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .close { display: grid; width: 20px; height: 20px; flex: 0 0 auto; place-items: center;
          border: 0; border-radius: 6px; padding: 0; background: transparent;
          color: var(--color-token-text-tertiary, currentColor); cursor: pointer;
          pointer-events: auto; -webkit-app-region: no-drag;
          transition: background-color var(--transition-duration-basic, .15s)
            var(--default-transition-timing-function, cubic-bezier(.4, 0, .2, 1)),
            color var(--transition-duration-basic, .15s)
            var(--default-transition-timing-function, cubic-bezier(.4, 0, .2, 1)),
            scale var(--transition-duration-basic, .15s)
            var(--ease-out, cubic-bezier(0, 0, .2, 1)); }
        .close:active { scale: .98; }
        .close:hover { background: var(--color-token-list-hover-background,
          color-mix(in srgb, currentColor 7%, transparent));
          color: var(--color-token-text-primary, currentColor); }
        .close:focus-visible { outline: 2px solid var(--color-token-focus-border, currentColor);
          outline-offset: -1px; }
        .close svg { width: 14px; height: 14px; fill: none; stroke: currentColor;
          stroke-width: 1.5; stroke-linecap: round; }
        @media (prefers-reduced-motion: reduce) {
          .tab, .label, .close { transition: none; }
          .label:active, .close:active { scale: 1; }
        }
      </style>
      <div class="bar">
        <div class="tab">
          <button class="label" type="button" role="tab" aria-selected="true">
            <span class="icon" aria-hidden="true">
              <svg viewBox="0 0 20 20">${SPINE_LOGO_MARKUP}</svg>
            </span>
            <span class="title"></span>
          </button>
          <button class="close" type="button">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8m0-8-8 8"/></svg>
          </button>
        </div>
      </div>`;

    const host = document.createElement("div");
    host.id = "spine-codex-workspace-detail";
    const headerHeight = Math.max(1, Math.round(header.getBoundingClientRect().height));
    host.style.cssText =
      `position:absolute;inset:${headerHeight}px 0 0;z-index:20;display:block;min-width:0;background:var(--color-token-main-surface-primary);`;
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { display: block; height: 100%; min-width: 0;
          color: var(--color-token-text-primary, currentColor); font-family: inherit; }
        * { box-sizing: border-box; }
        button { font: inherit; }
        .shell { display: flex; height: 100%; min-height: 0; flex-direction: column;
          background: var(--color-token-main-surface-primary, transparent); }
        .body { min-height: 0; flex: 1; overflow-x: hidden; overflow-y: auto;
          padding: 6px 16px 22px; scrollbar-width: thin; }
        .status-line { display: flex; align-items: center; gap: 8px; padding: 11px 0 12px;
          color: var(--color-token-text-secondary, currentColor); font-size: 13px; line-height: 18px; }
        .status-line svg { width: 16px; height: 16px; flex: 0 0 auto; fill: none; stroke: currentColor;
          stroke-width: 1.45; stroke-linecap: round; stroke-linejoin: round; }
        .status-line.done { color: var(--color-icon-success, #00a240); }
        .status-line.error { color: var(--color-icon-error, #e02e2a); }
        .status-line.warning { color: var(--color-icon-warning, #e25507); }
        .status-meta { margin-left: auto; color: var(--color-token-text-tertiary, currentColor);
          font-size: 12px; }
        .detail-section { padding: 13px 0; border-top: .5px solid
          var(--color-token-border-default, color-mix(in srgb, currentColor 12%, transparent)); }
        .detail-label { margin-bottom: 6px; color: var(--color-token-text-tertiary, currentColor);
          font-size: 12px; line-height: 16px; font-weight: 500; }
        .detail-text { color: var(--color-token-text-secondary, currentColor);
          font-size: 13px; line-height: 19px; white-space: pre-wrap; overflow-wrap: anywhere; }
        .detail-section.compact { display: grid; grid-template-columns: auto minmax(0,1fr);
          gap: 10px; align-items: baseline; }
        .detail-section.compact .detail-label { margin: 0; white-space: nowrap; }
        .detail-section.memory .detail-text { max-height: min(420px, 48vh); overflow: auto;
          scrollbar-width: thin; }
        .detail-note { margin-top: 7px; color: var(--color-token-text-tertiary, currentColor);
          font-size: 11.5px; line-height: 16px; }
        .detail-note.standalone { padding: 13px 0; margin: 0; border-top: .5px solid
          var(--color-token-border-default, color-mix(in srgb, currentColor 12%, transparent)); }
        .detail-actions { display: flex; flex-direction: column; margin: 3px -7px 0; padding-top: 6px;
          border-top: .5px solid var(--color-token-border-default,
          color-mix(in srgb, currentColor 12%, transparent)); }
        .detail-action { display: flex; min-height: 34px; align-items: center; gap: 9px; padding: 6px 8px;
          border: 0; border-radius: 7px; background: transparent;
          color: var(--color-token-text-secondary, currentColor); font-size: 13px;
          line-height: 18px; text-align: left; cursor: pointer; transform-origin: center;
          transition: background-color var(--transition-duration-basic, .15s)
            var(--default-transition-timing-function, cubic-bezier(.4, 0, .2, 1)),
            color var(--transition-duration-basic, .15s)
            var(--default-transition-timing-function, cubic-bezier(.4, 0, .2, 1)),
            scale var(--transition-duration-basic, .15s)
            var(--ease-out, cubic-bezier(0, 0, .2, 1)); }
        .detail-action:active:not(:disabled) { scale: .98; }
        .detail-action:hover { background: var(--color-token-list-hover-background,
          color-mix(in srgb, currentColor 6%, transparent));
          color: var(--color-token-text-primary, currentColor); }
        .detail-action:disabled { cursor: default; opacity: .55; }
        .detail-action:disabled:hover { background: transparent;
          color: var(--color-token-text-secondary, currentColor); }
        .detail-action:focus-visible { outline: 2px solid
          var(--color-token-focus-border, currentColor); outline-offset: -1px; }
        .detail-action svg { width: 15px; height: 15px; fill: none; stroke: currentColor;
          stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
        @media (prefers-reduced-motion: reduce) {
          * { scroll-behavior: auto !important; }
          .detail-action { transition: none; }
          .detail-action:active:not(:disabled) { scale: 1; }
        }
      </style>
      <div class="shell"><div class="body"></div></div>`;
    const closeButton = tabRoot.querySelector(".close");
    closeButton.setAttribute("aria-label", t("detail.close"));
    for (const type of ["pointerdown", "mousedown"]) {
      closeButton.addEventListener(type, (event) => event.stopPropagation(), true);
    }
    closeButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeWorkspaceDetail(true, true);
    }, true);
    tabRoot.querySelector(".label").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setWorkspaceDetailActive(true);
      if (!host.isConnected) scheduleWorkspaceDetailMount(24);
    });
    root.addEventListener("click", onWorkspaceDetailClick);
    const nativeTabStyle = document.createElement("style");
    nativeTabStyle.id = "spine-codex-native-tab-style";
    nativeTabStyle.textContent = `
      [data-spine-detail-active="true"]
      [data-app-shell-tab-controller="right"]:not(#spine-codex-workspace-tab)
      > [data-tab-id]:has(> button[role="tab"][aria-selected="true"])
      > div:first-child { background: transparent !important; }
    `;
    pane.append(nativeTabStyle);
    tabList.append(tabHost);
    pane.append(host);
    const originalNativeTabCount = [...tabList.children].filter((element) =>
      element !== tabHost &&
      element.matches?.('[data-app-shell-tab-controller="right"]')).length;
    state.detailUi = {
      pane,
      tabStrip,
      tabList,
      originalTabListWidth: tabList.style.width,
      originalNativeTabCount,
      tabHost,
      tabRoot,
      title: tabRoot.querySelector(".title"),
      closeButton,
      host,
      root,
      body: root.querySelector(".body"),
      nativeTabStyle,
      tabObserver: null,
      onTabStripClick: null,
      active: true,
    };
    const ui = state.detailUi;
    ui.onTabStripClick = (event) => {
      if (event.composedPath().includes(tabHost)) return;
      const target = event.target?.nodeType === Node.ELEMENT_NODE
        ? event.target
        : event.target?.parentElement;
      if (
        target?.closest?.(
          'button, [data-app-shell-tab-controller="right"]',
        )
      ) {
        queueMicrotask(() => {
          if (state.detailUi === ui) setWorkspaceDetailActive(false);
        });
      }
    };
    tabStrip.addEventListener("click", ui.onTabStripClick, true);
    ui.tabObserver = new MutationObserver(() => {
      queueMicrotask(() => syncWorkspaceTabList(ui));
    });
    ui.tabObserver.observe(tabList, {
      childList: true,
      attributes: true,
      attributeFilter: ["style"],
    });
    syncWorkspaceTabList(ui);
    setWorkspaceDetailActive(state.detailTabActive);
    return state.detailUi;
  }

  function ensureWorkspaceDetailUi(pane) {
    if (
      state.detailUi?.host.isConnected &&
      state.detailUi?.tabHost.isConnected &&
      state.detailUi.pane === pane
    ) {
      return state.detailUi;
    }
    return createWorkspaceDetailUi(pane);
  }

  function closeWorkspaceDetail(clearSelection = true, closeOwnedPane = true) {
    if (state.detailMountFrame) cancelAnimationFrame(state.detailMountFrame);
    if (state.detailRefreshFrame) cancelAnimationFrame(state.detailRefreshFrame);
    state.detailMountFrame = 0;
    state.detailRefreshFrame = 0;
    state.detailMountAttempts = 0;
    state.detailMountRetries = 0;
    state.detailRequested = false;
    state.detailTabActive = true;
    const paneWasReady = Boolean(workspacePane());
    const shouldClosePane =
      closeOwnedPane && state.detailOpenedPane && paneWasReady;
    state.detailOpenedPane = false;
    resetWorkspacePaneReadiness();
    restoreWorkspaceDetailUi();
    if (clearSelection) {
      const threadId = normalizeThreadId(state.activeThreadId);
      if (threadId) state.selectedRows.delete(threadId);
    }
    if (shouldClosePane) {
      const toggle = workspaceSidebarToggle();
      if (toggle) {
        state.detailToggleInProgress = true;
        toggle.click();
        state.detailToggleInProgress = false;
      }
      scheduleMount(36);
    }
    if (clearSelection && state.ui?.host.isConnected && state.expanded) renderActiveNow();
  }

  function sideStatus(icon, tone, text, meta = "") {
    const row = document.createElement("div");
    row.className = `status-line ${tone ?? ""}`;
    row.innerHTML = ICONS[icon] ?? ICONS.idle;
    const label = document.createElement("span");
    label.textContent = text;
    row.append(label);
    if (meta) {
      const secondary = document.createElement("span");
      secondary.className = "status-meta";
      secondary.textContent = meta;
      row.append(secondary);
    }
    return row;
  }

  function renderWorkspaceDetail(item, snapshot, pane) {
    const ui = ensureWorkspaceDetailUi(pane);
    if (!ui) return false;
    const body = document.createDocumentFragment();
    if (item.kind === "node") {
      const detail = nodeDetailModel(snapshot, item.nodeId);
      if (!detail) return false;
      ui.title.textContent = `Spine · ${detail.nodeId}`;
      const [icon, tone] = nodeVisual(detail, detail.active, detail.childCount > 0);
      const childMeta = detail.childCount > 0
        ? tp("detail.children", detail.childCount)
        : "";
      body.append(sideStatus(
        icon,
        tone,
        nodeStatusLabel(detail),
        [
          contextLocationLabel(snapshot, detail),
          childMeta,
        ].filter(Boolean).join(" · "),
      ));
      if (detail.path.length > 1) {
        body.append(createDetailSection(
          t("detail.branchPath"),
          detail.path.join("  ›  "),
          "compact",
        ));
      }
      if (detail.summary) body.append(createDetailSection(t("detail.task"), detail.summary));
      if (detail.spawnLink?.agentPath) body.append(createDetailSection(
        t("detail.agentPath"),
        detail.spawnLink.agentPath,
        "compact",
      ));
      if (detail.spawnLink?.threadId) body.append(createDetailSection(
        t("detail.childThread"),
        detail.spawnLink.threadId,
        "compact",
      ));
      const spawnTiming = detail.spawnLink
        ? spawnTimingDetail({
            ...detail.spawnLink,
            status:
              detail.spawnOutcome === "errored"
                ? "errored"
                : detail.spawnOutcome === "aborted"
                  ? "interrupted"
                  : "completed",
          })
        : null;
      if (spawnTiming) body.append(createDetailSection(
        t("detail.runtime"),
        spawnTiming,
        "compact",
      ));
      if (detail.memorySummary) {
        const memory = createDetailSection(
          t("detail.memory"),
          detail.memorySummary,
          "memory",
        );
        if (detail.memorySummaryTruncated) {
          const note = document.createElement("div");
          note.className = "detail-note";
          note.textContent = t("detail.memoryTruncated");
          memory.append(note);
        }
        body.append(memory);
      } else if (detail.active || detail.status === "opened") {
        const note = document.createElement("div");
        note.className = "detail-note standalone";
        note.textContent = t("detail.memoryPending");
        body.append(note);
      }
      const pressure = contextPressureText(detail.contextPressure);
      if (pressure) body.append(createDetailSection(
        t("detail.contextGrowth"), pressure, "compact"));
      if (detail.start != null) {
        const end = detail.end == null
          ? (detail.active ? t("timing.now") : null)
          : `#${detail.end}`;
        body.append(createDetailSection(
          t("detail.eventRange"),
          end ? `#${detail.start} → ${end}` : `#${detail.start}`,
          "compact",
        ));
      }
      const actions = document.createElement("div");
      actions.className = "detail-actions";
      if (detail.spawnOutcome) {
        actions.append(createDetailAction(
          t("detail.openSubagent"),
          "open-child-agent",
          JSON.stringify({
            ...(detail.spawnLink ?? {}),
            summary: detail.spawnLink?.summary || detail.summary,
            resultSummary: detail.memorySummary,
          }),
        ));
      }
      const subtreeToggleable =
        item.childCount > 0 &&
        item.subtreeKey &&
        (
          item.subtreeCollapsed ||
          state.expandedSubtrees.has(item.subtreeKey)
        );
      if (subtreeToggleable) {
        actions.append(createDetailAction(
          state.expandedSubtrees.has(item.subtreeKey)
            ? t("detail.hideSubtree")
            : t("detail.showSubtree"),
          "toggle-subtree",
          item.subtreeKey,
        ));
      }
      actions.append(createDetailAction(
        t("detail.copyNodeId"), "copy-node-id", detail.nodeId));
      if (detail.spawnLink?.threadId) actions.append(createDetailAction(
        t("detail.copyChildThreadId"),
        "copy-value",
        detail.spawnLink.threadId,
      ));
      if (detail.memorySummary) actions.append(createDetailAction(
        t("detail.copyMemory"), "copy-memory", detail.nodeId));
      body.append(actions);
    } else if (item.kind === "spawn") {
      const task = item.spawnTask;
      if (!task) return false;
      ui.title.textContent = t("spawn.title", {
        count: formatInteger(Number(task.ordinal) + 1),
      });
      const visual = spawnVisual(task.status);
      body.append(sideStatus(
        visual.icon,
        visual.tone,
        spawnStatusLabel(task.status),
      ));
      if (task.summary) body.append(createDetailSection(t("detail.task"), task.summary));
      if (task.agentPath) body.append(createDetailSection(
        t("detail.agentPath"), task.agentPath, "compact"));
      if (task.threadId) body.append(createDetailSection(
        t("detail.childThread"), task.threadId, "compact"));
      const timing = spawnTimingDetail(task);
      if (timing) body.append(createDetailSection(
        t("detail.runtime"),
        timing,
        "compact",
      ));
      if (task.threadId) {
        const actions = document.createElement("div");
        actions.className = "detail-actions";
        actions.append(createDetailAction(
          t("detail.openSubagent"),
          "open-child-agent",
          JSON.stringify({
            callId: task.callId,
            ordinal: task.ordinal,
            threadId: task.threadId,
            agentPath: task.agentPath,
            summary: task.summary,
            observedAtMs: task.observedAtMs,
            startedAtMs: task.startedAtMs,
            completedAtMs: task.completedAtMs,
          }),
        ));
        actions.append(createDetailAction(
          t("detail.copyChildThreadId"), "copy-value", task.threadId));
        body.append(actions);
      }
    } else {
      return false;
    }
    ui.body.replaceChildren(body);
    ui.body.scrollTop = 0;
    return true;
  }

  function selectedWorkspaceDetail() {
    const threadId = normalizeThreadId(state.activeThreadId);
    const snapshot = currentSnapshot();
    const rowKey = threadId ? state.selectedRows.get(threadId) : null;
    if (!snapshot || !rowKey) return null;
    const item = resolveWorkspaceDetailItem(snapshot, rowKey);
    return item ? { item, snapshot } : null;
  }

  function mountWorkspaceDetail() {
    if (!state.detailRequested || state.destroyed) return true;
    const selected = selectedWorkspaceDetail();
    if (!selected) {
      closeWorkspaceDetail(true, true);
      return true;
    }
    const candidate = workspacePaneCandidate();
    const layout = workspacePaneLayout(candidate);
    let pane = layout?.ready ? candidate : null;
    if (!pane) {
      state.detailPaneStableFrames = 0;
      if (candidate !== state.detailPaneCandidate) {
        state.detailPaneCandidate = candidate;
        state.detailPaneCollapsedFrames = 0;
        state.detailPaneLastMeasure = null;
      }
      const viewportWidth = document.documentElement.clientWidth || innerWidth;
      const collapsedPreview = Boolean(
        layout?.shellRect &&
        layout.shellRect.width < Math.min(240, layout.rect.width * 0.75) &&
        layout.rect.right > viewportWidth + 1 &&
        layout.opacity < 0.95
      );
      const measure = layout
        ? {
            pane: candidate,
            shellWidth: layout.shellRect?.width ?? 0,
            left: layout.rect.left,
            opacity: layout.opacity,
          }
        : null;
      const previous = state.detailPaneLastMeasure;
      const stableInvalid =
        !candidate ||
        Boolean(
          previous &&
          previous.pane === candidate &&
          Math.abs(previous.shellWidth - measure.shellWidth) < 0.75 &&
          Math.abs(previous.left - measure.left) < 0.75 &&
          Math.abs(previous.opacity - measure.opacity) < 0.01
        );
      state.detailPaneLastMeasure = measure;
      state.detailPaneCollapsedFrames =
        (!candidate || layout?.collapsed || collapsedPreview) && stableInvalid
          ? state.detailPaneCollapsedFrames + 1
          : 0;
      const toggle = workspaceSidebarToggle();
      if (
        !state.detailOpenedPane &&
        toggle &&
        state.detailPaneCollapsedFrames >= 4
      ) {
        state.detailOpenedPane = true;
        state.detailPaneCollapsedFrames = 0;
        state.detailPaneLastMeasure = null;
        state.detailToggleInProgress = true;
        toggle.click();
        state.detailToggleInProgress = false;
      }
      return false;
    }
    if (pane !== state.detailPaneCandidate) {
      state.detailPaneCandidate = pane;
      state.detailPaneStableFrames = 1;
      state.detailPaneCollapsedFrames = 0;
      return false;
    }
    state.detailPaneStableFrames += 1;
    state.detailPaneCollapsedFrames = 0;
    state.detailPaneLastMeasure = null;
    if (state.detailPaneStableFrames < 2) return false;
    state.detailMountRetries = 0;
    return renderWorkspaceDetail(selected.item, selected.snapshot, pane);
  }

  function scheduleWorkspaceDetailMount(attempts = 180) {
    if (!state.detailRequested || state.destroyed) return;
    state.detailMountAttempts = Math.max(state.detailMountAttempts, attempts);
    if (state.detailMountFrame) return;
    const attempt = () => {
      state.detailMountFrame = 0;
      if (mountWorkspaceDetail()) {
        state.detailMountAttempts = 0;
        return;
      }
      state.detailMountAttempts -= 1;
      if (state.detailMountAttempts > 0) {
        state.detailMountFrame = requestAnimationFrame(attempt);
      } else if (state.detailRequested && state.detailMountRetries < 2) {
        state.detailMountRetries += 1;
        state.detailOpenedPane = false;
        resetWorkspacePaneReadiness();
        state.detailMountAttempts = 120;
        state.detailMountFrame = requestAnimationFrame(attempt);
      }
    };
    state.detailMountFrame = requestAnimationFrame(attempt);
  }

  function scheduleWorkspaceDetailRefresh() {
    if (!state.detailRequested || state.detailRefreshFrame || state.destroyed) return;
    state.detailRefreshFrame = requestAnimationFrame(() => {
      state.detailRefreshFrame = 0;
      if (!mountWorkspaceDetail()) scheduleWorkspaceDetailMount(24);
    });
  }

  function onWorkspaceDetailClick(event) {
    const control = event.target?.closest?.("[data-spine-action]");
    if (!control) return;
    const action = control.dataset.spineAction;
    if (action === "toggle-subtree") {
      const key = control.dataset.value;
      if (!key) return;
      if (state.expandedSubtrees.has(key)) state.expandedSubtrees.delete(key);
      else state.expandedSubtrees.add(key);
      renderActiveNow(true);
      scheduleWorkspaceDetailRefresh();
      return;
    }
    if (action === "copy-node-id" || action === "copy-value") {
      void copyText(control.dataset.value ?? "", control);
    } else if (action === "open-child-agent") {
      let target = null;
      try {
        target = JSON.parse(control.dataset.value || "null");
      } catch {}
      if (target) void openNativeSubagent(target, control);
    } else if (action === "copy-memory") {
      const detail = nodeDetailModel(currentSnapshot(), control.dataset.value);
      void copyText(detail?.memorySummary ?? "", control);
    }
  }

  async function copyText(text, button) {
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement("textarea");
        area.value = text;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.append(area);
        area.select();
        if (!document.execCommand?.("copy")) throw new Error("copy unavailable");
        area.remove();
      }
      const label = button?.querySelector?.("span");
      if (!label) return;
      const previous = label.textContent;
      label.textContent = t("feedback.copied");
      setTimeout(() => {
        if (label.isConnected) label.textContent = previous;
      }, 1_200);
    } catch {}
  }

  function onTreeClick(event) {
    const control = event.target?.closest?.("[data-spine-action]");
    if (!control) return;
    const action = control.dataset.spineAction;
    const threadId = normalizeThreadId(state.activeThreadId);
    if (action === "toggle-bucket") {
      const bucketKey = control.dataset.bucketKey;
      if (!bucketKey) return;
      if (state.expandedBuckets.has(bucketKey)) state.expandedBuckets.delete(bucketKey);
      else state.expandedBuckets.add(bucketKey);
      renderActiveNow(true);
      return;
    }
    if (
      action === "toggle-context-history" ||
      action === "toggle-context-epoch"
    ) {
      const epochKey = control.dataset.epochKey;
      if (!epochKey) return;
      if (state.expandedEpochs.has(epochKey)) state.expandedEpochs.delete(epochKey);
      else state.expandedEpochs.add(epochKey);
      renderActiveNow(true);
      return;
    }
    if (action === "toggle-detail") {
      const rowKey = control.dataset.rowKey;
      if (!threadId || !rowKey) return;
      state.selectedRows.set(threadId, rowKey);
      state.detailRequested = true;
      state.detailTabActive = true;
      setWorkspaceDetailActive(true);
      state.detailMountRetries = 0;
      if (!state.detailUi) state.detailOpenedPane = false;
      renderActiveNow();
      scheduleWorkspaceDetailMount(60);
      return;
    }
    if (action === "toggle-subtree") {
      const subtreeKey = control.dataset.value;
      if (!subtreeKey) return;
      if (state.expandedSubtrees.has(subtreeKey)) state.expandedSubtrees.delete(subtreeKey);
      else state.expandedSubtrees.add(subtreeKey);
      renderActiveNow(true);
      return;
    }
    if (action === "copy-node-id" || action === "copy-value") {
      void copyText(control.dataset.value ?? "", control);
      return;
    }
    if (action === "copy-memory") {
      const detail = nodeDetailModel(currentSnapshot(), control.dataset.value);
      void copyText(detail?.memorySummary ?? "", control);
    }
  }

  function isFloatingSummarySurface(surface) {
    return Boolean(
      surface?.matches?.(
        '[data-slot="popover-content"][role="dialog"][data-state="open"]',
      ) &&
      surface.querySelector(
        '[data-slot="thread-summary-panel-section-actions"]',
      ) &&
      surface.querySelector("button.group\\/section-toggle"),
    );
  }

  function summarySurfaceFor(element) {
    const surface = element?.closest?.(
      '[data-pip-obstacle="thread-summary-panel"], ' +
      '[data-slot="popover-content"][role="dialog"][data-state="open"]',
    );
    if (!surface) return null;
    if (surface.hasAttribute("data-pip-obstacle")) return surface;
    return isFloatingSummarySurface(surface) ? surface : null;
  }

  function summaryPanels() {
    return [
      ...new Set([
        ...document.querySelectorAll(
          '[data-pip-obstacle="thread-summary-panel"]',
        ),
        ...[
          ...document.querySelectorAll(
            '[data-slot="popover-content"][role="dialog"][data-state="open"]',
          ),
        ].filter(isFloatingSummarySurface),
      ]),
    ].filter((panel) => panel.isConnected);
  }

  function summaryContainerMetrics(container) {
    if (!container?.isConnected) return null;
    const panel = summarySurfaceFor(container);
    if (!panel) return null;
    const rect = container.getBoundingClientRect();
    const viewportWidth =
      document.documentElement.clientWidth || innerWidth;
    const viewportHeight =
      document.documentElement.clientHeight || innerHeight;
    if (
      rect.width < 180 ||
      rect.width > 420 ||
      rect.height < 24
    ) {
      return null;
    }
    const visibleWidth = Math.max(
      0,
      Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0),
    );
    const visibleHeight = Math.max(
      0,
      Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0),
    );
    if (
      visibleWidth < Math.min(120, rect.width * 0.45) ||
      visibleHeight < 24
    ) {
      return null;
    }
    let opacity = 1;
    let highestZIndex = 0;
    for (
      let current = panel, depth = 0;
      current && current !== document.body && depth < 9;
      current = current.parentElement, depth += 1
    ) {
      if (
        current.hasAttribute?.("inert") ||
        current.getAttribute?.("aria-hidden") === "true"
      ) {
        return null;
      }
      const style = getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden") {
        return null;
      }
      const currentOpacity = Number.parseFloat(style.opacity);
      if (Number.isFinite(currentOpacity)) opacity *= currentOpacity;
      const zIndex = Number.parseFloat(style.zIndex);
      if (Number.isFinite(zIndex)) highestZIndex = Math.max(highestZIndex, zIndex);
    }
    if (opacity < 0.05) return null;
    const containerStyle = getComputedStyle(container);
    if (
      containerStyle.display === "none" ||
      containerStyle.visibility === "hidden" ||
      containerStyle.pointerEvents === "none"
    ) {
      return null;
    }
    const area = Math.max(1, rect.width * rect.height);
    const visibleRatio = (visibleWidth * visibleHeight) / area;
    const probeX = Math.max(
      0,
      Math.min(viewportWidth - 1, rect.left + rect.width / 2),
    );
    const probeY = Math.max(
      0,
      Math.min(viewportHeight - 1, rect.top + Math.min(18, rect.height / 2)),
    );
    const hit = document.elementFromPoint?.(probeX, probeY);
    const topmost = Boolean(hit && container.contains(hit));
    const current = state.ui?.host.parentElement === container;
    return {
      panel,
      score:
        (topmost ? 10_000 : 0) +
        opacity * 1_000 +
        visibleRatio * 100 +
        highestZIndex * 0.1 +
        (current ? 1 : 0) -
        Math.abs(rect.top - 60) * 0.02,
    };
  }

  function findSummaryContainer() {
    const candidates = [];
    for (const panel of summaryPanels()) {
      for (const button of panel.querySelectorAll("button")) {
        if (!button.classList.contains("group/section-toggle")) continue;
        const section = button.closest("section");
        const container = section?.parentElement;
        if (
          !container ||
          candidates.some((item) => item.container === container)
        ) {
          continue;
        }
        const sections = [...container.children].filter(
          (child) => child.tagName === "SECTION",
        ).length;
        const metrics = sections
          ? summaryContainerMetrics(container)
          : null;
        if (!metrics) continue;
        candidates.push({
          container,
          score: metrics.score,
        });
      }
    }
    candidates.sort((left, right) => right.score - left.score);
    return candidates[0]?.container ?? null;
  }

  function belongsToSummaryPanel(container) {
    return Boolean(summarySurfaceFor(container));
  }

  function isValidSummaryContainer(container) {
    return Boolean(summaryContainerMetrics(container));
  }

  function createUi(container) {
    const host = document.createElement("section");
    host.id = "spine-codex-view";
    host.className =
      "relative z-0 flex flex-col pb-3 after:absolute after:inset-x-3.5 after:bottom-0 " +
      "after:h-[0.5px] after:bg-token-border-default after:content-[''] last:after:hidden last:pb-0";
    host.style.pointerEvents = "auto";
    host.style.contain = "layout style";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { display: block; color: var(--color-token-text-primary, inherit); font-family: inherit;
          color-scheme: light dark; }
        * { box-sizing: border-box; }
        button { font: inherit; }
        .heading-row { min-height: 28px; display: flex; align-items: center;
          padding-right: 7px; }
        .heading { min-width: 0; flex: 1; min-height: 28px; display: flex; align-items: center; gap: 6px;
          padding: 1px 4px 1px 11px; border: 0; background: transparent;
          color: var(--color-token-text-tertiary, currentColor); cursor: pointer; text-align: left;
          transition: color var(--transition-duration-basic, .15s)
            var(--default-transition-timing-function, cubic-bezier(.4, 0, .2, 1)); }
        .heading:focus-visible { outline: 2px solid var(--color-token-focus-border, currentColor);
          outline-offset: -2px; border-radius: 6px; }
        .glyph { width: 16px; height: 16px; flex: none;
          color: var(--color-token-text-tertiary, currentColor);
          fill: none; stroke: currentColor; stroke-width: 1.35; stroke-linecap: round;
          stroke-linejoin: round; }
        .title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          font-size: 14px; line-height: 21px; font-weight: inherit; letter-spacing: normal; }
        .chevron { width: 13px; height: 13px; margin-left: 1px; opacity: 0;
          transition: transform var(--default-transition-duration, .15s)
            var(--default-transition-timing-function, cubic-bezier(.4, 0, .2, 1)),
            opacity var(--default-transition-duration, .15s)
            var(--default-transition-timing-function, cubic-bezier(.4, 0, .2, 1)); }
        .heading:hover .chevron, .heading:focus-visible .chevron { opacity: 1; }
        :host([data-expanded="false"]) .chevron { transform: rotate(-90deg); }
        .content-motion { display: grid; grid-template-rows: 1fr; opacity: 1; margin-top: 2px;
          transition: grid-template-rows var(--transition-duration-relaxed, .3s)
            var(--ease-enter, cubic-bezier(.19, 1, .22, 1)),
            opacity var(--transition-duration-relaxed, .3s)
            var(--ease-enter, cubic-bezier(.19, 1, .22, 1)),
            margin-top var(--transition-duration-relaxed, .3s)
            var(--ease-enter, cubic-bezier(.19, 1, .22, 1)); }
        :host([data-expanded="false"]) .content-motion {
          grid-template-rows: 0fr; opacity: 0; margin-top: 0; pointer-events: none; }
        .content-clip { min-height: 0; overflow: hidden; }
        .content { padding: 1px 10px 2px 11px; content-visibility: auto; contain: layout style; }
        .tree-motion { position: relative; min-width: 0; }
        .tree { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
        .row { --depth: 0; position: relative; min-height: 23px; display: grid;
          width: calc(100% - var(--depth) * 14px);
          grid-template-columns: 16px minmax(0, 1fr) auto 13px;
          align-items: start; gap: 5px; border: 0; background: transparent; text-align: left;
          margin-left: calc(var(--depth) * 14px); padding: 2px 4px 2px 2px; border-radius: 5px;
          color: var(--color-token-text-secondary, currentColor); font-size: 12.5px; line-height: 19px;
          cursor: pointer; transform-origin: center;
          transition: background-color var(--transition-duration-basic, .15s)
            var(--default-transition-timing-function, cubic-bezier(.4, 0, .2, 1)),
            color var(--transition-duration-basic, .15s)
            var(--default-transition-timing-function, cubic-bezier(.4, 0, .2, 1)),
            scale var(--transition-duration-basic, .15s)
            var(--ease-out, cubic-bezier(0, 0, .2, 1)); }
        .row:active { scale: .98; }
        .row[data-depth]:not([data-depth="0"])::before { content: ""; position: absolute;
          left: -8px; top: -2px; width: 7px; height: 13px;
          border-left: 1px solid var(--color-token-border-default, color-mix(in srgb, currentColor 18%, transparent));
          border-bottom: 1px solid var(--color-token-border-default, color-mix(in srgb, currentColor 18%, transparent));
          border-radius: 0 0 0 4px; pointer-events: none; }
        .row:hover { background: var(--color-token-list-hover-background,
          color-mix(in srgb, currentColor 6%, transparent)); }
        .row:focus-visible { outline: 2px solid var(--color-token-focus-border, currentColor);
          outline-offset: -2px; }
        .row.active, .row.selected { color: var(--color-token-text-primary, currentColor); }
        .row.limit { cursor: default; grid-template-columns: 16px minmax(0, 1fr); }
        .row.limit:hover { background: transparent; }
        .row.context-history { min-height: 25px; margin-bottom: 2px; padding-top: 3px; padding-bottom: 3px;
          color: var(--color-token-text-tertiary, currentColor); }
        .row.context-history .label, .row.context-epoch .label {
          font-size: 11.5px; line-height: 19px; font-weight: 500; }
        .row.context-epoch { color: var(--color-token-text-tertiary, currentColor); }
        .row-meta { color: var(--color-token-text-tertiary, currentColor);
          font-size: 10.5px; line-height: 19px; white-space: nowrap; }
        .status-icon { width: 16px; height: 19px; display: grid; place-items: center;
          color: var(--color-token-text-tertiary, currentColor); }
        .status-icon svg { width: 15px; height: 15px; fill: none; stroke: currentColor;
          stroke-width: 1.35; stroke-linecap: round; stroke-linejoin: round; }
        .status-icon .fill { fill: currentColor; stroke: none; }
        .status-icon.live { color: var(--color-token-text-primary, currentColor); }
        .status-icon.done { color: var(--color-icon-success, #00a240); }
        .status-icon.error { color: var(--color-icon-error,
          var(--color-token-error-foreground, #e02e2a)); }
        .status-icon.warning { color: var(--color-icon-warning,
          var(--color-token-editor-warning-foreground, #e25507)); }
        .status-icon.muted { color: var(--color-token-text-tertiary,
          color-mix(in srgb, currentColor 50%, transparent)); }
        .label { min-width: 0; overflow-wrap: anywhere; }
        .row-affordance { width: 13px; height: 19px; display: grid; place-items: center;
          color: var(--color-token-text-tertiary, currentColor); opacity: 0;
          transition: opacity var(--default-transition-duration, .15s)
            var(--default-transition-timing-function, cubic-bezier(.4, 0, .2, 1)),
            transform var(--default-transition-duration, .15s)
            var(--default-transition-timing-function, cubic-bezier(.4, 0, .2, 1)); }
        .row-affordance svg { width: 12px; height: 12px; fill: none; stroke: currentColor;
          stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
        .row:hover .row-affordance, .row:focus-visible .row-affordance,
        .row.selected .row-affordance, .row.bucket .row-affordance,
        .row.context-history .row-affordance,
        .row.context-epoch .row-affordance { opacity: 1; }
        .row[aria-expanded="true"] .row-affordance { transform: rotate(90deg); }
        .empty { padding: 9px 4px 11px; color: var(--color-token-text-tertiary, currentColor);
          font-size: 12.5px; line-height: 18px; }
        footer { padding: 5px 3px 1px; color: var(--color-token-text-tertiary, currentColor);
          font-size: 11px; line-height: 15px; }
        @media (prefers-reduced-motion: reduce) {
          .heading, .chevron, .content-motion, .row, .row-affordance { transition: none; }
          .row:active { scale: 1; }
        }
      </style>
      <div class="heading-row">
        <button class="heading" type="button" aria-expanded="true">
          <svg class="glyph" viewBox="0 0 20 20" aria-hidden="true">
            ${SPINE_LOGO_MARKUP}
          </svg>
          <span class="title">Spine Tree</span>
          <svg class="chevron" viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M4.2 7.2a.75.75 0 0 1 1.06 0L10 11.94l4.74-4.74a.75.75 0 1 1 1.06 1.06l-5.27 5.27a.75.75 0 0 1-1.06 0L4.2 8.26a.75.75 0 0 1 0-1.06Z"/></svg>
        </button>
      </div>
      <div class="content-motion">
        <div class="content-clip">
          <div class="content"><div class="tree-motion"><div class="tree"></div></div><footer></footer></div>
        </div>
      </div>`;
    const heading = root.querySelector(".heading");
    const contentMotion = root.querySelector(".content-motion");
    const setExpanded = (expanded) => {
      state.expanded = expanded;
      host.dataset.expanded = String(expanded);
      heading.setAttribute("aria-expanded", String(expanded));
      contentMotion.toggleAttribute("inert", !expanded);
      contentMotion.setAttribute("aria-hidden", String(!expanded));
      writeExpandedState();
      if (expanded) scheduleRender();
      else if (state.frame) {
        cancelAnimationFrame(state.frame);
        state.frame = 0;
      }
    };
    heading.addEventListener("click", () => setExpanded(!state.expanded));
    root.querySelector(".tree").addEventListener("click", onTreeClick);
    state.ui = {
      host,
      root,
      tree: root.querySelector(".tree"),
      treeMotion: root.querySelector(".tree-motion"),
      contentMotion,
      footer: root.querySelector("footer"),
      setExpanded,
    };
    host.dataset.expanded = String(state.expanded);
    heading.setAttribute("aria-expanded", String(state.expanded));
    contentMotion.toggleAttribute("inert", !state.expanded);
    contentMotion.setAttribute("aria-hidden", String(!state.expanded));
    container.prepend(host);
    connectPanelObserver(container);
    if (state.expanded) renderActiveNow();
  }

  function mountUi() {
    if (!document.body || state.destroyed) return false;
    connectSummarySurfaceObserver();
    const container = findSummaryContainer();
    if (!container) {
      if (
        state.ui?.host.isConnected &&
        !isValidSummaryContainer(state.ui.host.parentElement)
      ) {
        state.ui.host.remove();
      }
      return false;
    }
    let reattached = false;
    if (!state.ui) createUi(container);
    else if (state.ui.host.parentElement !== container) {
      container.prepend(state.ui.host);
      reattached = true;
    }
    connectPanelObserver(container);
    if (reattached && state.expanded) renderActiveNow();
    return true;
  }

  function scheduleMount(attempts = 24) {
    if (state.destroyed) return;
    state.mountAttempts = Math.max(state.mountAttempts, attempts);
    if (state.mountFrame) return;
    const attempt = () => {
      state.mountFrame = 0;
      if (mountUi()) {
        state.mountAttempts = 0;
        return;
      }
      state.mountAttempts -= 1;
      if (state.mountAttempts > 0) state.mountFrame = requestAnimationFrame(attempt);
    };
    state.mountFrame = requestAnimationFrame(attempt);
  }

  function ensureMounted(attempts = 24) {
    connectSummarySurfaceObserver();
    const container = findSummaryContainer();
    if (
      container &&
      state.ui?.host.isConnected &&
      state.ui.host.parentElement === container &&
      isValidSummaryContainer(container)
    ) {
      return true;
    }
    if (mountUi()) return true;
    scheduleMount(attempts);
    return false;
  }

  function connectPanelObserver(container) {
    const root = container.parentElement ?? container;
    if (state.panelRoot === root) return;
    state.panelObserver?.disconnect();
    state.panelRoot = root;
    state.panelObserver = new MutationObserver(queueSummaryMount);
    state.panelObserver.observe(container, { childList: true });
    if (root !== container) state.panelObserver.observe(root, { childList: true });
  }

  function queueSummaryMount() {
    if (state.summaryMountQueued || state.destroyed) return;
    state.summaryMountQueued = true;
    queueMicrotask(() => {
      state.summaryMountQueued = false;
      connectSummarySurfaceObserver();
      ensureMounted(24);
    });
  }

  function stopSummaryTriggerObserver() {
    state.summaryTriggerObserver?.disconnect();
    state.summaryTriggerObserver = null;
    if (state.summaryTriggerTimer) clearTimeout(state.summaryTriggerTimer);
    state.summaryTriggerTimer = 0;
  }

  function settleSummaryTrigger() {
    if (state.destroyed) {
      stopSummaryTriggerObserver();
      return;
    }
    connectSummarySurfaceObserver();
    if (mountUi()) {
      stopSummaryTriggerObserver();
      return;
    }
    scheduleMount(120);
  }

  function armSummaryTriggerObserver() {
    if (!document.body || typeof MutationObserver !== "function") {
      scheduleMount(120);
      return;
    }
    stopSummaryTriggerObserver();
    state.summaryTriggerObserver = new MutationObserver(() => {
      if (!summaryPanels().length) return;
      queueMicrotask(settleSummaryTrigger);
    });
    state.summaryTriggerObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style", "class", "aria-hidden", "inert"],
    });
    state.summaryTriggerTimer = setTimeout(stopSummaryTriggerObserver, 3_000);
    queueMicrotask(() => {
      connectSummarySurfaceObserver();
      ensureMounted(12);
    });
  }

  function isTopToolbarLayoutButton(button) {
    if (!button || button.tagName !== "BUTTON") return false;
    if (!button.querySelector("svg")) return false;
    const rect = button.getBoundingClientRect();
    if (
      rect.width < 20 ||
      rect.width > 52 ||
      rect.height < 20 ||
      rect.height > 52 ||
      rect.top < -4 ||
      rect.bottom > 84
    ) {
      return false;
    }
    return rect.right >= document.documentElement.clientWidth * 0.4;
  }

  function connectSummarySurfaceObserver() {
    if (typeof MutationObserver !== "function") return;
    const panels = summaryPanels();
    if (
      panels.length === state.summarySurfacePanels.length &&
      panels.every((panel, index) =>
        panel === state.summarySurfacePanels[index])
    ) {
      return;
    }
    state.summarySurfaceObserver?.disconnect();
    state.summarySurfacePanels = panels;
    if (!panels.length) {
      state.summarySurfaceObserver = null;
      return;
    }
    state.summarySurfaceObserver = new MutationObserver(queueSummaryMount);
    const targets = new Set();
    for (const panel of panels) {
      targets.add(panel);
      if (panel.parentElement) targets.add(panel.parentElement);
      if (panel.parentElement?.parentElement) {
        targets.add(panel.parentElement.parentElement);
      }
    }
    for (const target of targets) {
      state.summarySurfaceObserver.observe(target, {
        childList: true,
        attributes: true,
        attributeFilter: ["style", "class", "aria-hidden", "inert"],
      });
    }
  }

  function prefersReducedMotion() {
    return Boolean(
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function cssDurationMilliseconds(value, fallback) {
    const normalized = String(value ?? "").trim();
    const number = Number.parseFloat(normalized);
    if (!Number.isFinite(number) || number < 0) return fallback;
    if (normalized.endsWith("ms")) return number;
    if (normalized.endsWith("s")) return number * 1_000;
    return fallback;
  }

  function nativeTreeMotionSpec() {
    const style = getComputedStyle(state.ui?.host ?? document.documentElement);
    return {
      duration: cssDurationMilliseconds(
        style.getPropertyValue("--transition-duration-relaxed"),
        300,
      ),
      easing:
        style.getPropertyValue("--cubic-enter").trim() ||
        "cubic-bezier(.19, 1, .22, 1)",
    };
  }

  function finishTreeMotion() {
    if (state.treeMotionTimer) clearTimeout(state.treeMotionTimer);
    state.treeMotionTimer = 0;
    state.treeMotionToken += 1;
    const motion = state.ui?.treeMotion;
    if (!motion) return;
    for (const animation of motion.getAnimations?.({ subtree: true }) ?? []) {
      animation.cancel();
    }
    for (const ghost of motion.querySelectorAll("[data-spine-motion-ghost]")) {
      ghost.remove();
    }
    motion.style.removeProperty("height");
    motion.style.removeProperty("overflow");
    motion.style.removeProperty("transition");
  }

  function captureTreeMotion() {
    finishTreeMotion();
    const motion = state.ui?.treeMotion;
    if (!motion?.isConnected || prefersReducedMotion()) return null;
    const motionRect = motion.getBoundingClientRect();
    const rows = new Map();
    for (const [key, row] of state.rows) {
      if (row.isConnected && row.parentElement === state.ui.tree) {
        rows.set(key, { row, rect: row.getBoundingClientRect() });
      }
    }
    return {
      height: motionRect.height,
      motionRect,
      rows,
    };
  }

  function animateTreeProjection(before, liveKeys) {
    const motion = state.ui?.treeMotion;
    const tree = state.ui?.tree;
    if (!before || !motion?.isConnected || !tree?.isConnected) return;
    const { duration, easing } = nativeTreeMotionSpec();
    if (duration <= 0 || prefersReducedMotion()) return;
    const newHeight = tree.getBoundingClientRect().height;
    const token = ++state.treeMotionToken;
    motion.style.height = `${before.height}px`;
    motion.style.overflow = "hidden";
    motion.style.transition = "none";
    void motion.offsetHeight;
    motion.style.transition = `height ${duration}ms ${easing}`;

    for (const [key, previous] of before.rows) {
      if (liveKeys.has(key)) continue;
      const ghost = previous.row.cloneNode(true);
      const left = previous.rect.left - before.motionRect.left;
      const top = previous.rect.top - before.motionRect.top;
      ghost.dataset.spineMotionGhost = "true";
      ghost.removeAttribute("data-spine-action");
      ghost.style.position = "absolute";
      ghost.style.left = `${left}px`;
      ghost.style.top = `${top}px`;
      ghost.style.width = `${previous.rect.width}px`;
      ghost.style.height = `${previous.rect.height}px`;
      ghost.style.marginLeft = "0";
      ghost.style.pointerEvents = "none";
      ghost.style.zIndex = "2";
      ghost.style.transformOrigin = "top";
      motion.append(ghost);
      const animation = ghost.animate([
        { opacity: 1, clipPath: "inset(0 0 0 0)", transform: "translateY(0)" },
        { opacity: 0, clipPath: "inset(0 0 100% 0)", transform: "translateY(-2px)" },
      ], { duration, easing, fill: "forwards" });
      animation.finished.then(() => ghost.remove(), () => ghost.remove());
    }

    for (const [key, row] of state.rows) {
      if (!row.isConnected || row.parentElement !== tree) continue;
      const previous = before.rows.get(key);
      if (!previous) {
        row.animate([
          { opacity: 0, transform: "translateY(-4px)" },
          { opacity: 1, transform: "translateY(0)" },
        ], { duration, easing });
        continue;
      }
      const nextRect = row.getBoundingClientRect();
      const deltaY = previous.rect.top - nextRect.top;
      if (Math.abs(deltaY) < 0.5) continue;
      row.animate([
        { transform: `translateY(${deltaY}px)` },
        { transform: "translateY(0)" },
      ], { duration, easing });
    }

    requestAnimationFrame(() => {
      if (token === state.treeMotionToken && motion.isConnected) {
        motion.style.height = `${newHeight}px`;
      }
    });
    state.treeMotionTimer = setTimeout(() => {
      if (token !== state.treeMotionToken || !motion.isConnected) return;
      state.treeMotionTimer = 0;
      for (const ghost of motion.querySelectorAll("[data-spine-motion-ghost]")) {
        ghost.remove();
      }
      motion.style.removeProperty("height");
      motion.style.removeProperty("overflow");
      motion.style.removeProperty("transition");
    }, duration + 50);
  }

  function scheduleRender() {
    if (!state.expanded || state.frame || !state.ui?.host.isConnected || state.destroyed) return;
    state.frame = requestAnimationFrame(() => {
      state.frame = 0;
      render();
    });
  }

  function renderActiveNow(animateTree = false) {
    if (!state.expanded || !state.ui || state.destroyed) return;
    if (state.frame) {
      cancelAnimationFrame(state.frame);
      state.frame = 0;
    }
    render(animateTree);
  }

  function render(animateTree = false) {
    if (!animateTree) finishTreeMotion();
    const snapshot = currentSnapshot();
    if (!snapshot) {
      if (state.detailRequested) closeWorkspaceDetail(true, true);
      state.ui.tree.replaceChildren(emptyRow(
        state.activeThreadId
          ? t("tree.noActivity")
          : t("tree.waiting"),
      ));
      state.ui.footer.textContent = "";
      return;
    }
    const projected = projectSnapshot(snapshot);
    const treeMotion = animateTree ? captureTreeMotion() : null;
    const fragment = document.createDocumentFragment();
    const liveKeys = new Set();
    const threadId = normalizeThreadId(snapshot.threadId);
    const selectedKey = threadId ? state.selectedRows.get(threadId) : null;
    const selectedItem = selectedKey
      ? resolveWorkspaceDetailItem(snapshot, selectedKey, projected)
      : null;
    for (const item of projected) {
      liveKeys.add(item.key);
      let row = state.rows.get(item.key);
      if (!row) {
        row = document.createElement(item.kind === "limit" ? "div" : "button");
        if (row.tagName === "BUTTON") row.type = "button";
        row.className = "row";
        row.innerHTML =
          '<span class="status-icon" aria-hidden="true"></span>' +
          '<span class="label"></span>' +
          '<span class="row-meta"></span>' +
          '<span class="row-affordance" aria-hidden="true">' +
          '<svg viewBox="0 0 20 20"><path d="m7.5 4.75 5.25 5.25-5.25 5.25"/></svg></span>';
        state.rows.set(item.key, row);
      }
      const selectable = item.kind === "node" || item.kind === "spawn";
      const selected = selectable && selectedKey === item.key;
      row.className =
        `row ${item.kind}${item.active ? " active" : ""}${item.current ? " current" : ""}${selected ? " selected" : ""}`;
      row.style.setProperty("--depth", String(item.depth));
      row.dataset.depth = String(item.depth);
      row.dataset.last = String(Boolean(item.last));
      if (item.kind === "context-history") {
        row.dataset.spineAction = "toggle-context-history";
        row.dataset.epochKey = item.epochKey;
        delete row.dataset.bucketKey;
        delete row.dataset.rowKey;
        row.setAttribute("aria-expanded", String(Boolean(item.expanded)));
        row.title = t("tree.showEarlier");
      } else if (item.kind === "context-epoch") {
        row.dataset.spineAction = "toggle-context-epoch";
        row.dataset.epochKey = item.epochKey;
        delete row.dataset.bucketKey;
        delete row.dataset.rowKey;
        row.setAttribute("aria-expanded", String(Boolean(item.expanded)));
        row.title = t("tree.showCompaction", {
          count: formatInteger(item.compactionNumber),
        });
      } else if (item.kind === "bucket") {
        row.dataset.spineAction = "toggle-bucket";
        row.dataset.bucketKey = item.bucketKey;
        delete row.dataset.rowKey;
        row.setAttribute("aria-expanded", String(Boolean(item.expanded)));
        row.title = t("tree.showBranches");
      } else if (selectable) {
        row.dataset.spineAction = "toggle-detail";
        row.dataset.rowKey = item.key;
        delete row.dataset.bucketKey;
        row.setAttribute("aria-expanded", String(selected));
        row.title = t("tree.viewDetails");
      } else {
        delete row.dataset.spineAction;
        delete row.dataset.epochKey;
        delete row.dataset.current;
        delete row.dataset.bucketKey;
        delete row.dataset.rowKey;
        row.removeAttribute("aria-expanded");
        row.removeAttribute("title");
      }
      const status = row.children[0];
      status.className = `status-icon ${item.tone}`;
      if (row.dataset.icon !== item.icon) {
        status.innerHTML = ICONS[item.icon] ?? ICONS.idle;
        row.dataset.icon = item.icon;
      }
      row.children[1].textContent = item.label;
      row.children[2].textContent = item.meta ?? "";
      fragment.append(row);
    }
    for (const [key] of state.rows) {
      if (!liveKeys.has(key)) state.rows.delete(key);
    }
    if (selectedKey && !selectedItem && threadId) {
      state.selectedRows.delete(threadId);
      if (state.detailRequested) closeWorkspaceDetail(false, true);
    } else if (selectedItem && state.detailRequested) {
      scheduleWorkspaceDetailRefresh();
    } else if (state.detailRequested) {
      closeWorkspaceDetail(true, true);
    }
    state.ui.tree.replaceChildren(
      projected.length
        ? fragment
        : emptyRow(t("tree.empty")),
    );
    if (treeMotion) animateTreeProjection(treeMotion, liveKeys);
    state.ui.footer.textContent = tp("tree.nodes", snapshot.nodes.length);
  }

  function emptyRow(text) {
    const element = document.createElement("div");
    element.className = "empty";
    element.textContent = text;
    return element;
  }

  function settingsCopy() {
    return {
      title: t("settings.title"),
      loading: t("settings.loading"),
      saving: t("settings.saving"),
      saved: t("settings.saved"),
      unavailable: t("settings.unavailable"),
      error: t("settings.error"),
      retry: t("settings.retry"),
      appliesToNew: t("settings.applies"),
    };
  }

  function humanizeFeatureName(name) {
    return String(name)
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function featureCopy(feature) {
    const copy = settingsCopy();
    const labelKey = `feature.${feature.name}.label`;
    const descriptionKey = `feature.${feature.name}.description`;
    const knownLabel = messageTemplate(labelKey);
    const knownDescription = messageTemplate(descriptionKey);
    const label = knownLabel !== labelKey
      ? knownLabel
      : feature.displayName ?? humanizeFeatureName(feature.name);
    const rawDescription = knownDescription !== descriptionKey
      ? knownDescription
      : feature.description ?? "";
    const description = rawDescription
      ? `${rawDescription.replace(/\s+$/, "")} ${copy.appliesToNew}`
      : copy.appliesToNew;
    return {
      label,
      description,
      toggle: t("settings.toggle", { label }),
    };
  }

  function isSpineSettingsFeature(feature) {
    return (
      typeof feature.name === "string" &&
      feature.name.length <= 80 &&
      /^[a-z][a-z0-9_]*$/.test(feature.name) &&
      SPINE_FEATURE_PREFIX.test(feature.name) &&
      (
        feature.stage === "beta" ||
        (
          feature.stage === "stable" &&
          SPINE_STABLE_SETTINGS_FEATURES.has(feature.name)
        )
      )
    );
  }

  function selectSpineSettingsFeatures(features) {
    const priority = new Map([
      ["spine_jit", 0],
      ["spine_trim", 1],
      ["spine_spawn", 2],
      ["spinetree_memory_projection", 3],
    ]);
    return (Array.isArray(features) ? features : [])
      .filter(isSpineSettingsFeature)
      .sort((left, right) =>
        (priority.get(left.name) ?? 100) - (priority.get(right.name) ?? 100) ||
        left.name.localeCompare(right.name),
      )
      .map((feature) => ({
        name: feature.name,
        stage: feature.stage,
        displayName: typeof feature.displayName === "string"
          ? feature.displayName.slice(0, 160)
          : null,
        description: typeof feature.description === "string"
          ? feature.description.slice(0, 1_000)
          : null,
        enabled: feature.enabled === true,
        defaultEnabled: feature.defaultEnabled === true,
      }));
  }

  function activeAgentSettingsPanel() {
    return document.querySelector?.(
      'button[data-settings-panel-slug="agent"][aria-current="page"]',
    ) ?? null;
  }

  function findModelFeaturesSection() {
    if (!activeAgentSettingsPanel() || typeof document.querySelectorAll !== "function") {
      return null;
    }
    const sections = [...document.querySelectorAll("section")].filter((section) => {
      if (section.id === SETTINGS_SECTION_ID || !section.isConnected) return false;
      const rect = section.getBoundingClientRect?.();
      return rect && rect.width >= 450 && rect.height > 0;
    });
    return sections.find((section) =>
      Boolean(section.querySelector?.('button[role="switch"][aria-label*="Ultra" i]'))) ??
      null;
  }

  function activeThreadHostId() {
    const selected = document.querySelector?.(
      '[data-app-action-sidebar-thread-active="true"], ' +
      '[data-app-action-sidebar-thread-id][aria-current="page"]',
    );
    const hostId = (
      selected?.getAttribute("data-app-action-sidebar-thread-host-id") ??
      selectedSidebarItem()?.getAttribute("data-app-action-sidebar-thread-host-id") ??
      null
    );
    if (hostId) state.lastActiveHostId = hostId;
    return hostId ?? state.lastActiveHostId;
  }

  function hostIdForLabel(label) {
    const normalized = label?.trim().toLowerCase();
    if (!normalized) return null;
    const localLabels = new Set(
      Object.keys(UI_MESSAGES).map((locale) =>
        messageTemplate("host.local", locale).toLocaleLowerCase(locale)),
    );
    if (localLabels.has(normalized)) return "local";
    return state.hostIds.find((hostId) => {
      const suffix = hostId.split(":").pop()?.trim().toLowerCase();
      return normalized === hostId.toLowerCase() || normalized === suffix;
    }) ?? null;
  }

  function selectedSettingsHostId(modelSection = state.settingsModelSection) {
    const modelRect = modelSection?.getBoundingClientRect?.();
    if (modelRect && typeof document.querySelectorAll === "function") {
      const candidates = [...document.querySelectorAll("button")]
        .map((button) => {
          if (button.closest?.("[data-app-action-sidebar-thread-id]")) return null;
          const hostId = hostIdForLabel(button.textContent);
          if (!hostId) return null;
          const rect = button.getBoundingClientRect?.();
          const isHostMenu = button.getAttribute?.("aria-haspopup") === "menu";
          if (
            !rect ||
            rect.width <= 0 ||
            rect.height <= 0 ||
            (rect.x < modelRect.x - 280 && !isHostMenu) ||
            rect.y > modelRect.y
          ) {
            return null;
          }
          return { hostId, isHostMenu, x: rect.x, y: rect.y };
        })
        .filter(Boolean)
        .sort((left, right) =>
          Number(right.isHostMenu) - Number(left.isHostMenu) ||
          right.x - left.x ||
          left.y - right.y,
        );
      if (candidates[0]) return candidates[0].hostId;
    }
    const active = activeThreadHostId();
    return active && state.hostIds.includes(active) ? active : active ?? "local";
  }

  async function loadHostCatalog() {
    if (state.hostCatalogLoaded) return;
    state.hostCatalogLoaded = true;
    try {
      const bootstrap = await window.electronBridge?.getInitialSidebarBootstrap?.();
      const snapshot =
        bootstrap?.catalogSnapshot ??
        bootstrap?.catalog_snapshot ??
        bootstrap;
      const hosts = snapshot?.hosts ?? bootstrap?.hosts ?? [];
      const ids = hosts
        .map((host) => host?.hostId ?? host?.host_id)
        .filter((hostId) => typeof hostId === "string" && hostId);
      state.hostIds = [...new Set(["local", ...ids])];
      scheduleSettingsMount(8);
    } catch {}
  }

  function settleAppServerResponse(data) {
    if (data?.type !== "mcp-response") return false;
    const response = data.message ?? data.response;
    const requestId = response?.id == null ? null : String(response.id);
    const pending = requestId ? state.pendingRequests.get(requestId) : null;
    if (!pending) return false;
    state.pendingRequests.delete(requestId);
    clearTimeout(pending.timeout);
    if (response.error) {
      pending.reject(new Error(
        response.error.message ?? `App Server request failed (${response.error.code ?? "unknown"})`,
      ));
    } else {
      pending.resolve(response.result);
    }
    return true;
  }

  function sendAppServerRequest(hostId, method, params) {
    const bridge = window.electronBridge;
    if (typeof bridge?.sendMessageFromView !== "function") {
      return Promise.reject(new Error("Codex App Server bridge is unavailable"));
    }
    const requestId = `spine-codex-settings-${Date.now()}-${++state.requestSequence}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        state.pendingRequests.delete(requestId);
        reject(new Error(`${method} timed out`));
      }, 7_000);
      state.pendingRequests.set(requestId, { resolve, reject, timeout });
      Promise.resolve(bridge.sendMessageFromView({
        type: "mcp-request",
        hostId,
        request: {
          jsonrpc: "2.0",
          id: requestId,
          method,
          params,
        },
      })).catch((error) => {
        const pending = state.pendingRequests.get(requestId);
        if (!pending) return;
        state.pendingRequests.delete(requestId);
        clearTimeout(pending.timeout);
        reject(error);
      });
    });
  }

  function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function createSettingsSection(modelSection) {
    state.settingsSection?.remove?.();
    const copy = settingsCopy();
    const section = createElement("section", modelSection.className || "flex flex-col");
    section.id = SETTINGS_SECTION_ID;
    section.dataset.spineCodexSettings = VERSION;
    section.style.contain = "layout style";

    const header = createElement(
      "div",
      "pb-1.5 flex min-h-toolbar items-center justify-between gap-4",
    );
    const headerStack = createElement("div", "flex min-w-0 flex-1 flex-col gap-0.5");
    const title = createElement(
      "div",
      "font-medium text-token-text-primary text-base",
      copy.title,
    );
    headerStack.append(title);
    header.append(headerStack);

    const content = createElement("div", "flex flex-col gap-1.5");
    const card = createElement(
      "div",
      "flex flex-col [&>*:not(:last-child)]:relative " +
      "[&>*:not(:last-child)]:after:pointer-events-none " +
      "[&>*:not(:last-child)]:after:absolute " +
      "[&>*:not(:last-child)]:after:inset-x-4 " +
      "[&>*:not(:last-child)]:after:bottom-0 " +
      "[&>*:not(:last-child)]:after:h-[0.5px] " +
      "[&>*:not(:last-child)]:after:bg-token-border " +
      "[&>*:not(:last-child)]:after:content-[''] " +
      "overflow-hidden rounded-2xl border border-token-border",
    );
    card.style.backgroundColor =
      "var(--color-background-panel, var(--color-token-bg-fog))";
    content.append(card);
    section.append(header, content);
    modelSection.after(section);

    state.settingsSection = section;
    state.settingsModelSection = modelSection;
    state.settingsLoadedHostId = null;
    state.settingsError = null;
    state.settingsSavedFeature = null;
    state.settingsUi = {
      title,
      card,
    };
    renderSettings();
    return section;
  }

  function createSettingsStatusRow(text, retryable = false) {
    const copy = settingsCopy();
    const row = createElement(
      "div",
      "flex min-h-[52px] items-center justify-between px-4 gap-6 py-3",
    );
    const message = createElement(
      "div",
      "min-w-0 text-xs leading-4 text-balance text-token-text-secondary",
      text,
    );
    row.append(message);
    if (retryable) {
      const retry = createElement(
        "button",
        "border-token-border no-drag cursor-interaction items-center gap-1 border " +
        "whitespace-nowrap select-none focus:outline-none disabled:cursor-not-allowed " +
        "disabled:opacity-40 flex rounded-lg text-token-foreground " +
        "bg-token-foreground/5 enabled:hover:bg-token-foreground/10 " +
        "enabled:active:bg-token-foreground/15 border-transparent " +
        "h-token-button-composer px-2 py-0 text-base leading-[18px]",
        copy.retry,
      );
      retry.type = "button";
      retry.addEventListener("click", () => readSpineSettings(
        selectedSettingsHostId(state.settingsModelSection),
        true,
      ));
      row.append(retry);
    }
    return row;
  }

  function createSettingsFeatureRow(feature) {
    const copy = settingsCopy();
    const featureText = featureCopy(feature);
    const row = createElement(
      "div",
      "flex items-center justify-between px-4 gap-6 py-3",
    );
    row.dataset.spineFeatureName = feature.name;
    const labelGroup = createElement("div", "flex min-w-0 flex-1 items-center gap-3");
    const labelStack = createElement("div", "flex min-w-0 flex-col gap-0.5");
    const label = createElement(
      "div",
      "min-w-0 text-token-text-primary text-sm font-medium",
      featureText.label,
    );
    let descriptionText = featureText.description;
    if (state.settingsSavingFeature === feature.name) descriptionText = copy.saving;
    else if (state.settingsSavedFeature === feature.name) descriptionText = copy.saved;
    const description = createElement(
      "div",
      "min-w-0 text-xs leading-4 text-balance text-token-text-secondary",
      descriptionText,
    );
    labelStack.append(label, description);
    labelGroup.append(labelStack);

    const control = createElement("div", "flex max-w-full shrink-0 items-center gap-2");
    const toggle = createElement(
      "button",
      "inline-flex items-center text-sm focus-visible:outline-none " +
      "focus-visible:ring-2 focus-visible:ring-token-focus-border " +
      "focus-visible:rounded-full cursor-interaction",
    );
    toggle.type = "button";
    toggle.setAttribute("role", "switch");
    toggle.setAttribute("aria-label", featureText.toggle);
    toggle.setAttribute("aria-checked", String(feature.enabled));
    toggle.dataset.state = feature.enabled ? "checked" : "unchecked";
    toggle.disabled = state.settingsLoading || state.settingsSaving;
    if (state.settingsSavingFeature === feature.name) {
      toggle.setAttribute("aria-busy", "true");
    }
    const track = createElement(
      "span",
      "relative inline-flex shrink-0 items-center rounded-full transition-colors " +
      `duration-basic ease-out ${
        feature.enabled ? "bg-token-charts-blue" : "bg-token-foreground/10"
      } h-5 w-8`,
    );
    track.dataset.state = feature.enabled ? "checked" : "unchecked";
    const thumb = createElement(
      "span",
      "rounded-full border border-[color:var(--gray-0)] bg-[color:var(--gray-0)] " +
      "shadow-sm transition-transform duration-basic ease-out " +
      "data-[state=unchecked]:translate-x-0 h-4 w-4 " +
      "data-[state=unchecked]:translate-x-[2px] " +
      "data-[state=checked]:translate-x-[14px]",
    );
    thumb.dataset.state = feature.enabled ? "checked" : "unchecked";
    track.append(thumb);
    toggle.append(track);
    toggle.addEventListener("click", () => {
      const current = state.settingsFeatures.get(feature.name);
      if (!current || state.settingsLoading || state.settingsSaving) return;
      writeSpineFeature(feature.name, !current.enabled);
    });
    control.append(toggle);
    row.append(labelGroup, control);
    return row;
  }

  function renderSettings() {
    const ui = state.settingsUi;
    if (!ui || !state.settingsSection?.isConnected) return;
    const copy = settingsCopy();
    ui.title.textContent = copy.title;
    let rows;
    if (state.settingsLoading) rows = [createSettingsStatusRow(copy.loading)];
    else if (state.settingsError) rows = [createSettingsStatusRow(copy.error, true)];
    else if (!state.settingsAvailable) rows = [createSettingsStatusRow(copy.unavailable)];
    else rows = [...state.settingsFeatures.values()].map(createSettingsFeatureRow);
    ui.card.replaceChildren(...rows);
  }

  async function listExperimentalFeatures(hostId) {
    const features = [];
    let cursor = null;
    for (let page = 0; page < 10; page += 1) {
      const result = await sendAppServerRequest(
        hostId,
        "experimentalFeature/list",
        cursor ? { limit: 100, cursor } : { limit: 100 },
      );
      if (Array.isArray(result?.data)) features.push(...result.data);
      cursor = typeof result?.nextCursor === "string" && result.nextCursor
        ? result.nextCursor
        : null;
      if (!cursor) break;
    }
    return features;
  }

  async function readSpineSettings(hostId, force = false) {
    if (!hostId || state.destroyed) return;
    if (
      !force &&
      state.settingsLoadedHostId === hostId &&
      !state.settingsError
    ) {
      renderSettings();
      return;
    }
    const epoch = ++state.settingsRequestEpoch;
    state.settingsHostId = hostId;
    state.settingsLoading = true;
    state.settingsError = null;
    state.settingsSavedFeature = null;
    renderSettings();
    try {
      const features = selectSpineSettingsFeatures(
        await listExperimentalFeatures(hostId),
      );
      if (state.destroyed || epoch !== state.settingsRequestEpoch) return;
      state.settingsFeatures = new Map(
        features.map((feature) => [feature.name, feature]),
      );
      state.settingsAvailable = features.length > 0;
      state.settingsLoadedHostId = hostId;
    } catch (error) {
      if (state.destroyed || epoch !== state.settingsRequestEpoch) return;
      state.settingsAvailable = false;
      state.settingsFeatures = new Map();
      state.settingsError = error;
    } finally {
      if (!state.destroyed && epoch === state.settingsRequestEpoch) {
        state.settingsLoading = false;
        renderSettings();
      }
    }
  }

  async function writeSpineFeature(featureName, enabled) {
    const hostId = state.settingsHostId ?? selectedSettingsHostId();
    const feature = state.settingsFeatures.get(featureName);
    if (
      !hostId ||
      state.settingsSaving ||
      !isSpineSettingsFeature(feature) ||
      state.destroyed
    ) {
      return;
    }
    const previous = feature.enabled;
    const epoch = ++state.settingsRequestEpoch;
    state.settingsFeatures.set(featureName, {
      ...feature,
      enabled: Boolean(enabled),
    });
    state.settingsSaving = true;
    state.settingsSavingFeature = featureName;
    state.settingsError = null;
    state.settingsSavedFeature = null;
    renderSettings();
    try {
      await sendAppServerRequest(hostId, "config/batchWrite", {
        edits: [{
          keyPath: `features.${featureName}`,
          value: Boolean(enabled),
          mergeStrategy: "upsert",
        }],
        filePath: null,
        expectedVersion: null,
        reloadUserConfig: false,
      });
      if (state.destroyed || epoch !== state.settingsRequestEpoch) return;
      state.settingsLoadedHostId = hostId;
      state.settingsSavedFeature = featureName;
      if (state.settingsSavedTimer) clearTimeout(state.settingsSavedTimer);
      state.settingsSavedTimer = setTimeout(() => {
        state.settingsSavedTimer = 0;
        state.settingsSavedFeature = null;
        renderSettings();
      }, 2_500);
    } catch (error) {
      if (state.destroyed || epoch !== state.settingsRequestEpoch) return;
      state.settingsFeatures.set(featureName, {
        ...feature,
        enabled: previous,
      });
      state.settingsError = error;
    } finally {
      if (!state.destroyed && epoch === state.settingsRequestEpoch) {
        state.settingsSaving = false;
        state.settingsSavingFeature = null;
        renderSettings();
        scheduleSettingsMount(4);
      }
    }
  }

  function mountSettings() {
    if (!document.body || state.destroyed) return false;
    if (!activeAgentSettingsPanel()) {
      if (state.settingsSection?.isConnected) state.settingsSection.remove();
      state.settingsSection = null;
      state.settingsModelSection = null;
      state.settingsUi = null;
      state.settingsLoadedHostId = null;
      return false;
    }
    const modelSection = findModelFeaturesSection();
    if (!modelSection) return false;
    if (
      !state.settingsSection?.isConnected ||
      state.settingsSection.previousElementSibling !== modelSection
    ) {
      createSettingsSection(modelSection);
    } else {
      state.settingsModelSection = modelSection;
    }
    const hostId = selectedSettingsHostId(modelSection);
    if (
      hostId !== state.settingsLoadedHostId &&
      !state.settingsLoading &&
      !state.settingsSaving
    ) {
      readSpineSettings(hostId);
    }
    return true;
  }

  function scheduleSettingsMount(attempts = 18) {
    if (state.destroyed || !document.body) return;
    state.settingsAttempts = Math.max(state.settingsAttempts, attempts);
    if (state.settingsFrame) return;
    const attempt = () => {
      state.settingsFrame = 0;
      if (mountSettings()) {
        state.settingsAttempts = 0;
        return;
      }
      state.settingsAttempts -= 1;
      if (state.settingsAttempts > 0) {
        state.settingsFrame = requestAnimationFrame(attempt);
      }
    };
    state.settingsFrame = requestAnimationFrame(attempt);
  }

  function maybeScheduleSettingsFromClick(target) {
    if (!document.body) return;
    const element = target?.nodeType === Node.ELEMENT_NODE
      ? target
      : target?.parentElement;
    activeThreadHostId();
    if (
      activeAgentSettingsPanel() ||
      element?.closest?.("[data-settings-panel-slug]")
    ) {
      scheduleSettingsMount(24);
    }
  }

  function onKeyDown(event) {
    if (event.key === "Escape" && state.detailRequested) {
      event.preventDefault();
      closeWorkspaceDetail(true, true);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === ",") {
      scheduleSettingsMount(30);
    }
  }

  function ingest(message) {
    if (!message || message.type !== "mcp-notification") return false;
    const changed =
      message.method === TREE_METHOD
        ? rememberSnapshot(message.params)
        : message.method === SPAWN_METHOD
          ? rememberSpawn(
              message.params,
              message.hostId ?? message.host_id ?? activeThreadHostId(),
            )
          : false;
    const threadId = normalizeThreadId(message.params?.threadId);
    if (changed && document.body && !state.ui?.host.isConnected) scheduleMount(24);
    if (changed && threadId === state.activeThreadId && state.expanded) scheduleRender();
    if (changed && threadId === state.activeThreadId && state.detailRequested) {
      scheduleWorkspaceDetailRefresh();
    }
    return changed;
  }

  function onMessage(event) {
    if (!settleAppServerResponse(event.data)) ingest(event.data);
  }

  function activateThread(threadId) {
    if (threadId === state.activeThreadId) {
      if (state.expanded && state.ui?.host.isConnected) scheduleRender();
      if (state.detailRequested) scheduleWorkspaceDetailRefresh();
      return;
    }
    if (state.detailRequested) closeWorkspaceDetail(true, true);
    state.selectedRows.clear();
    state.activeThreadId = threadId;
    touchSnapshot(threadId);
    trimThreadCache();
    state.rows.clear();
    renderActiveNow();
  }

  function scheduleSwitchSync() {
    queueMicrotask(() => ensureMounted(24));
    if (state.switchFrame) cancelAnimationFrame(state.switchFrame);
    state.switchFrame = requestAnimationFrame(() => {
      state.switchFrame = 0;
      handleThreadSelection();
      ensureMounted(12);
    });
  }

  function onSidebarClick(event) {
    const target = event.target;
    maybeScheduleSettingsFromClick(target);
    const clickedButton = target?.nodeType === Node.ELEMENT_NODE
      ? target.closest?.("button")
      : target?.parentElement?.closest?.("button");
    if (clickedButton && clickedButton === childAgentSummaryButton()) {
      scheduleNativeSubagentLabelSync(24);
    }
    const clickedSpawnTarget = clickedButton
      ? knownSpawnTargets().find((target) =>
          findNativeSubagentButton(target) === clickedButton)
      : null;
    if (clickedSpawnTarget) {
      armNativeSubagentTitleHook(clickedSpawnTarget);
      stopNativeSubagentListObserver();
      scheduleNativeSubagentLabelSync(24);
    }
    if (
      state.detailRequested &&
      !state.detailToggleInProgress &&
      clickedButton === workspaceSidebarToggle()
    ) {
      closeWorkspaceDetail(true, false);
      scheduleMount(36);
      return;
    }
    if (isTopToolbarLayoutButton(clickedButton)) armSummaryTriggerObserver();
    const item = target?.nodeType === Node.ELEMENT_NODE
      ? target.closest?.("[data-app-action-sidebar-thread-id]")
      : target?.parentElement?.closest?.("[data-app-action-sidebar-thread-id]");
    if (!item) return;
    stopNativeSubagentListObserver();
    const itemHostId = item.getAttribute("data-app-action-sidebar-thread-host-id");
    if (itemHostId) state.lastActiveHostId = itemHostId;
    const raw = item.getAttribute("data-app-action-sidebar-thread-id");
    const threadId = normalizeThreadId(raw) ?? state.threadAliases.get(raw) ?? null;
    if (threadId) {
      state.pendingSidebarRaw = null;
      state.pendingPreviousMainId = null;
    } else {
      state.pendingSidebarRaw = raw;
      state.pendingPreviousMainId = mainThreadId();
    }
    activateThread(threadId);
    scheduleSwitchSync();
  }

  function handleThreadSelection() {
    connectSidebarObserver();
    connectThreadObserver();
    activateThread(selectedThreadId());
    ensureMounted(24);
  }

  function findSidebarRoot() {
    const first = document.querySelector("[data-app-action-sidebar-thread-id]");
    if (!first) return null;
    let candidate = first.parentElement;
    for (let current = first.parentElement; current && current !== document.body; current = current.parentElement) {
      const rect = current.getBoundingClientRect();
      const count = current.querySelectorAll("[data-app-action-sidebar-thread-id]").length;
      if (count >= 2 && rect.width <= 420) candidate = current;
    }
    return candidate;
  }

  function connectSidebarObserver() {
    if (typeof MutationObserver !== "function") return;
    const root = findSidebarRoot();
    if (!root || state.sidebarRoot === root) return;
    state.sidebarObserver?.disconnect();
    state.sidebarRoot = root;
    state.sidebarObserver = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) =>
        mutation.type === "childList" ||
        mutation.target.matches?.("[data-app-action-sidebar-thread-id]"));
      if (relevant) queueMicrotask(handleThreadSelection);
    });
    state.sidebarObserver.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "data-app-action-sidebar-thread-id"],
    });
  }

  function connectThreadObserver() {
    if (typeof MutationObserver !== "function") return;
    const root = document.querySelector('[data-pip-anchor-host="codex-main-thread"]');
    if (!root || state.threadRoot === root) return;
    state.threadObserver?.disconnect();
    state.threadRoot = root;
    state.threadObserver = new MutationObserver((mutations) => {
      const selector = "[data-response-annotation-conversation]";
      const panelSelector = '[data-pip-obstacle="thread-summary-panel"]';
      const panelChanged = mutations.some((mutation) =>
        mutation.target.closest?.(panelSelector) ||
        [...mutation.addedNodes, ...mutation.removedNodes].some((node) =>
          node.nodeType === Node.ELEMENT_NODE &&
          (node.matches?.(panelSelector) || node.querySelector?.(panelSelector))));
      if (panelChanged) queueSummaryMount();
      const relevant = mutations.some((mutation) => {
        if (mutation.type === "attributes") return mutation.target.matches?.(selector);
        return [...mutation.addedNodes, ...mutation.removedNodes].some((node) =>
          node.nodeType === Node.ELEMENT_NODE &&
          (node.matches?.(selector) || node.querySelector?.(selector)));
      });
      if (relevant) queueMicrotask(handleThreadSelection);
    });
    state.threadObserver.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-response-annotation-conversation"],
    });
  }

  function onResize() {
    if (
      state.ui?.host.isConnected &&
      !isValidSummaryContainer(state.ui.host.parentElement)
    ) {
      state.ui.host.remove();
    }
    ensureMounted(12);
    if (activeAgentSettingsPanel()) scheduleSettingsMount(12);
  }

  function initialize() {
    refreshLocale();
    connectLocaleObserver();
    window.addEventListener("languagechange", onLanguageChange);
    state.activeThreadId = selectedThreadId();
    connectSidebarObserver();
    connectThreadObserver();
    connectSummarySurfaceObserver();
    loadHostCatalog();
    scheduleMount(60);
    scheduleSettingsMount(30);
    scheduleNativeSubagentLabelSync(24);
  }

  function clearCache() {
    cancelSnapshotCacheWrite();
    state.snapshotCacheDirty = false;
    state.snapshots.clear();
    state.spawns.clear();
    state.namedSpawnThreads.clear();
    state.namingSpawnThreads.clear();
    state.selectedRows.clear();
    state.expandedBuckets.clear();
    state.expandedEpochs.clear();
    state.expandedSubtrees.clear();
    state.subagentLabelAttempts = 0;
    if (state.subagentLabelFrame) cancelAnimationFrame(state.subagentLabelFrame);
    state.subagentLabelFrame = 0;
    stopNativeSubagentListObserver();
    stopNativeSubagentTitleHook();
    state.threadAliases.clear();
    state.rows.clear();
    closeWorkspaceDetail(false, true);
    try {
      localStorage.removeItem(SNAPSHOT_CACHE_KEY);
      localStorage.removeItem(THREAD_ALIASES_KEY);
    } catch {}
    renderActiveNow();
    return true;
  }

  window.addEventListener("message", onMessage, true);
  window.addEventListener("resize", onResize, { passive: true });
  window.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("click", onSidebarClick, true);

  const api = Object.freeze({
    version: VERSION,
    ingest,
    projectSnapshot,
    getStats: () => ({
      open: state.expanded,
      embedded: Boolean(state.ui?.host.isConnected),
      activeThreadId: state.activeThreadId,
      activeCached: Boolean(currentSnapshot()),
      threads: state.snapshots.size,
      rows: state.rows.size,
      framePending: state.frame !== 0,
      mountPending: state.mountFrame !== 0,
      settingsEmbedded: Boolean(state.settingsSection?.isConnected),
      settingsHostId: state.settingsHostId,
      settingsAvailable: state.settingsAvailable,
      settingsEnabled:
        state.settingsFeatures.get("spine_spawn")?.enabled === true,
      settingsFeatures: [...state.settingsFeatures.values()].map((feature) => ({
        name: feature.name,
        enabled: feature.enabled,
      })),
      settingsLoading: state.settingsLoading,
      settingsSaving: state.settingsSaving,
      locale: state.locale,
      localeSource: state.localeSource,
      supportedLocales: Object.keys(UI_MESSAGES),
      detailOpen: state.detailRequested,
      detailMounted: Boolean(state.detailUi?.host.isConnected),
      detailSurface: "workspace-sidebar",
      detailMountPending:
        state.detailMountFrame !== 0 || state.detailRefreshFrame !== 0,
      treeMotionPending: state.treeMotionTimer !== 0,
      expandedBuckets: state.expandedBuckets.size,
      expandedEpochs: state.expandedEpochs.size,
      expandedSubtrees: state.expandedSubtrees.size,
      subagentLabelSyncPending: state.subagentLabelFrame !== 0,
      subagentListObserved: Boolean(state.subagentListObserver),
      subagentTitleHookPending: Boolean(state.subagentTitleObserver),
    }),
    exportSnapshots: () => [...state.snapshots.values()],
    getNodeDetail: (snapshot, nodeId) => nodeDetailModel(snapshot, nodeId),
    resolveDetailItem: (snapshot, rowKey) =>
      resolveWorkspaceDetailItem(snapshot, rowKey),
    nativeSpawnTaskTitle,
    normalizeSpawnStatus,
    spawnPhase,
    spawnTimingText,
    spawnTimingDetail,
    mergeSpawnTask,
    findNativeSubagentButton,
    findNativeSubagentDetailTitle,
    syncNativeSubagentLabel,
    syncNativeSubagentDetailTitle,
    armNativeSubagentTitleHook,
    connectNativeSubagentListObserver,
    syncNativeSubagentLabels,
    openNativeSubagent,
    nameSpawnThread: (hostId, task) => nameSpawnThread(hostId, task),
    setSpawnThreadName: (hostId, task) => setSpawnThreadName(hostId, task),
    setBucketExpanded: (bucketKey, expanded = true) => {
      if (typeof bucketKey !== "string" || !bucketKey) return false;
      if (expanded) state.expandedBuckets.add(bucketKey);
      else state.expandedBuckets.delete(bucketKey);
      scheduleRender();
      return true;
    },
    setEpochExpanded: (epochKey, expanded = true) => {
      if (typeof epochKey !== "string" || !epochKey) return false;
      if (expanded) state.expandedEpochs.add(epochKey);
      else state.expandedEpochs.delete(epochKey);
      scheduleRender();
      return true;
    },
    setSubtreeExpanded: (subtreeKey, expanded = true) => {
      if (typeof subtreeKey !== "string" || !subtreeKey) return false;
      if (expanded) state.expandedSubtrees.add(subtreeKey);
      else state.expandedSubtrees.delete(subtreeKey);
      scheduleRender();
      return true;
    },
    selectSettingsFeatures: (features) => selectSpineSettingsFeatures(features),
    resolveLocale: resolveCodexLocale,
    translate: (key, values) => t(key, values),
    refreshLocale,
    clearCache,
    sync: handleThreadSelection,
    syncSettings: () => {
      scheduleSettingsMount(24);
      return true;
    },
    destroy: () => {
      state.destroyed = true;
      window.removeEventListener("message", onMessage, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("languagechange", onLanguageChange);
      document.removeEventListener("click", onSidebarClick, true);
      state.sidebarObserver?.disconnect();
      state.threadObserver?.disconnect();
      state.panelObserver?.disconnect();
      state.summarySurfaceObserver?.disconnect();
      state.localeObserver?.disconnect();
      stopSummaryTriggerObserver();
      finishTreeMotion();
      cancelSnapshotCacheWrite();
      if (state.snapshotCacheDirty) writeSnapshotCache();
      if (state.frame) cancelAnimationFrame(state.frame);
      if (state.switchFrame) cancelAnimationFrame(state.switchFrame);
      if (state.mountFrame) cancelAnimationFrame(state.mountFrame);
      if (state.detailMountFrame) cancelAnimationFrame(state.detailMountFrame);
      if (state.detailRefreshFrame) cancelAnimationFrame(state.detailRefreshFrame);
      if (state.settingsFrame) cancelAnimationFrame(state.settingsFrame);
      if (state.subagentLabelFrame) cancelAnimationFrame(state.subagentLabelFrame);
      stopNativeSubagentListObserver();
      stopNativeSubagentTitleHook();
      if (state.settingsSavedTimer) clearTimeout(state.settingsSavedTimer);
      for (const pending of state.pendingRequests.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error("Spine settings renderer was destroyed"));
      }
      state.pendingRequests.clear();
      closeWorkspaceDetail(false, true);
      state.ui?.host.remove();
      state.settingsSection?.remove();
      delete window[GLOBAL_KEY];
    },
  });
  Object.defineProperty(window, GLOBAL_KEY, { value: api, configurable: true });

  if (document.body) initialize();
  else document.addEventListener("DOMContentLoaded", initialize, { once: true });
  return VERSION;
})();
