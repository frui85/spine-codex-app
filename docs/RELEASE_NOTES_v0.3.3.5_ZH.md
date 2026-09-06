# SpineCodex App v0.3.3.5 中文发布说明

[English release notes](RELEASE_NOTES_v0.3.3.5.md)

这是一个仅 App 的启动修复版本，恢复在 Codex Desktop `26.901.51231` 上的启动。
该构建同时关闭了 Electron `nodeOptions` 与 `nodeCliInspect` fuse。官方
`@spinejit/spine-codex@0.3.3` 基线保持不变。

## 兼容性

| 组件 | 发布状态 |
|---|---|
| SpineCodex App | 0.3.3.5 |
| SpineCodex 本地最低版本 | 0.2.2 |
| SpineCodex 推荐基线 | 0.3.3 |
| SpineCodex 0.3.3 的 Codex 兼容身份 | 0.147.0 |
| 已验证 Codex Desktop | 26.810.41047、26.818.41509、26.825.51511、26.901.20858、26.901.51231 |

## 私有可注入 Desktop 克隆

已安装 Desktop 关闭 Node CLI Inspector fuse 后，`--inspect*` 与 `SIGUSR1` 都无法
打开主进程 Inspector，v0.3.3.4 因此在预检阶段停止。启动器现在会：

- 用 APFS `clonefile` 把已安装 bundle 克隆到
  `~/Library/Application Support/SpineCodex App/inspectable-desktop/`
  （同一卷上不额外占用磁盘空间）；
- 只改写克隆中 Electron fuse wire 的一个字节，重新启用 `nodeCliInspect`；
- 以 hardened runtime 做 ad-hoc 重签名，保留能力类 entitlement，去掉仅能由描述
  文件授权的条目（`application-identifier`、`keychain-access-groups`、
  `application-groups`、`com.apple.developer.*`）；
- 用 `codesign --verify --deep --strict` 校验克隆、记录清单，然后以仅限回环地址
  的 `--inspect-brk` 端口暂停启动克隆，在首个脚本运行前加载主进程 hook；
- 最多等待 60 秒让该 Inspector 就绪，主端口与备用端口共用同一截止时间：新签名
  的克隆首次执行时，AMFI 校验 Electron framework 需要数秒，暂停中的主进程之后
  才开始监听。

已安装 Desktop 未变化时复用克隆，Desktop 更新后重建。设置
`SPINE_CODEX_DISABLE_DESKTOP_CLONE=1` 可恢复原来的 fail-closed 预检错误；
`SPINE_CODEX_DESKTOP_CLONE_ROOT` 可改变克隆位置。

克隆的已知限制：推送通知和与其他 OpenAI 应用共享的钥匙串在克隆内不可用；由于
签名不同，macOS 可能再次询问自动化、摄像头、麦克风等权限。

不会修改原始 ChatGPT.app、官方 SpineCodex CLI 或用户会话数据。

## 验证

- 包装层测试套件通过，包含新增的 fuse wire、entitlement 与克隆生命周期回归测试。
- 在 macOS 26.6.2、Desktop `26.901.51231`（`nodeOptions` 与 `nodeCliInspect`
  fuse 均关闭）上，按本方案准备的克隆通过了 `codesign --verify --deep --strict`，
  以 `--inspect-brk` 启动、约 7 秒后暴露回环 Node Inspector 目标，新克隆
  （8.5 秒建好）从 `spine-app` 启动到报告 `Spine Tree ready` 约 25 秒；只读
  bundle 契约检查接受该 Desktop 构建。
- 安装后请先运行 `spine-app --diagnose`，再运行一次 `spine-app`，在本机确认完整
  启动路径；首次启动会准备克隆，多花几秒。
