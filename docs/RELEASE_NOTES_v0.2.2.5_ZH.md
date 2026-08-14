# SpineCodex App v0.2.2.5 中文修复说明

本次仅更新包装层，最低仍要求外部安装 SpineCodex 0.2.2 或更高版本。

## 修复内容

- 恢复对 ChatGPT Desktop `26.810.41047` 的启动兼容性。
- 识别新版分组式 SSH app-server bootstrap，包括安全目录创建、转发 SSH
  Agent 准备和日志初始化。
- 在注入 SpineCodex bootstrap 前完整替换分组清理表达式，避免产生未闭合的
  shell 子进程分组。
- 对未知 Electron bundle 结构继续保持失败关闭，不启动未经验证的后端路径。

## 验证结果

- 已使用从 ChatGPT Desktop `26.810.41047` 提取的 main 和 shared bundle
  验证兼容补丁。
- 生成的 SSH bootstrap 已通过 `/bin/sh -n` 语法检查。
- 完整测试套件和 macOS arm64 发布构建均已在本机通过。
