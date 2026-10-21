# Changelog

## 0.3.4

- `/v1/meta` 返回真实版本号


## 0.3.3

- 服务端：CSS 改为 `/assets/app.css?v=版本` 外链，一年强缓存；HTML 加 `no-cache`


## 0.3.2

- 新增图标
- 文档重组：README 精简，细节移到 docs/


## 0.3.1

- publisher 改为 moteam，仓库迁到 MoTeam-cn
- 发布改由 GitHub Actions 驱动（tag 触发）


## 0.3.0

- AI 会话日志从 2 个工具扩到 35 个：新增 provider 表与通用 JSON 提取器
- 支持 Claude 系、Codex 系、Cline 系、Gemini 与 22 个通用工具
- 读 SQLite 的 16 个工具明确不支持（扩展宿主无驱动）

## 0.2.1

- 新增 AI 会话日志：读 Claude Code 与 Codex 的 transcript，补发带 `ai_line_changes` 的心跳
- 增量读取，按字节偏移记录进度

## 0.2.0

- 语言表扩到 1023 条映射 / 793 个官方语言名
- 配置兼容 `~/.wakatime.cfg` 全部 34 项，VS Code 设置优先覆盖
- 事件源从 4 个补到 10 个，心跳补 `dependencies` 与 AI 字段，发送走 30 秒缓冲
- 依赖检测 16 种包清单
- 项目识别支持多根工作区、`hide_project_*`、`include_only_with_project_file`、`exclude_unknown_project`
- 过滤改 POSIX 正则，隐私四项 `hide_*`
- 状态栏五种模式
- AI 扩展检测与 AI/人工行变更计数
- 远程开发支持、HTTP 代理、诊断命令

## 0.1.0

- 首个版本：心跳上报、项目与分支识别、离线队列、状态栏
