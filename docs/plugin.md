# waka-selfhost 插件文档

VS Code 扩展的完整说明。市场页只放摘要，细节都在这里。

## 安装

市场搜索 `waka-selfhost`，或：

```bash
code --install-extension moteam.waka-selfhost
```

手动安装：下载 `.vsix` 后 `Extensions: Install from VSIX`。

## 与官方 WakaTime 插件共存

两个插件可以同时装、同时上报，互不干扰：

| | 官方 vscode-wakatime | waka-selfhost |
| --- | --- | --- |
| 配置文件 | `~/.wakatime.cfg` | **`~/.waka-selfhost.cfg`** |
| 上报目标 | `api.wakatime.com` | 你自建的服务端 |
| 依赖 | 会下载 `wakatime-cli` 二进制 | 纯 JS，无外部依赖 |

本扩展**只读写自己的配置文件**，不碰 `~/.wakatime.cfg`，所以官方插件无论怎么改自己的配置都不会影响这里，反之亦然。

想两边都上报，就分别配好各自的地址和 Key，两者会各发各的心跳。

## 配置

### 首次配置

安装后如果没有配置，状态栏会显示 **$(warning) 未配置服务地址**，并弹出一次引导提示。点击状态栏或运行命令：

```
waka-selfhost: 设置服务端地址与 API Key
```

按提示填两项：

1. **服务端地址** —— 必须以 `/v1` 结尾，例如 `http://192.168.1.10:8800/v1`
2. **API Key** —— 在服务端「设置」页面生成，`waka_` 开头

没配置之前不会发任何心跳，避免无效请求。

### 方式一：命令面板（推荐）

| 命令 | 作用 |
| --- | --- |
| `waka-selfhost: 设置 API URL` | 写入 `api_url`，例如 `http://192.168.1.10:8800/v1` |
| `waka-selfhost: 设置 API Key` | 写入 `api_key` |
| `waka-selfhost: 设置代理` | 写入 `proxy` |

这些命令直接改 `~/.waka-selfhost.cfg`，与官方 CLI 共用同一份文件。

### 方式二：编辑配置文件

`~/.waka-selfhost.cfg`（Windows 是 `C:\Users\你的用户名\.wakatime.cfg`）：

```ini
[settings]
api_url = http://192.168.1.10:8800/v1
api_key = waka_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
debug = false
```

设置 `WAKATIME_HOME` 环境变量可以把配置目录换到别处。

### 方式三：VS Code 设置

搜索 `wakaSelfhost`，可覆盖 cfg 里的同名项：

| 设置项 | 默认 | 说明 |
| --- | --- | --- |
| `wakaSelfhost.apiKey` | 空 | 留空则读 cfg |
| `wakaSelfhost.apiUrl` | 空 | 留空则读 cfg |
| `wakaSelfhost.enabled` | true | 总开关 |
| `wakaSelfhost.debug` | false | 输出调试日志 |
| `wakaSelfhost.proxy` | 空 | `http://host:port` |
| `wakaSelfhost.logFile` | 空 | 留空写 `~/.wakatime/waka-selfhost.log` |
| `wakaSelfhost.statusBarEnabled` | true | 显示状态栏 |
| `wakaSelfhost.statusBarCodingActivity` | false | 状态栏显示当前项目 |
| `wakaSelfhost.statusBarHideMinutes` | false | 只显示小时 |
| `wakaSelfhost.heartbeatRateLimitSeconds` | 120 | 心跳最小间隔 |
| `wakaSelfhost.exclude` | 空 | 排除路径正则 |
| `wakaSelfhost.include` | 空 | 强制记录，优先于 exclude |
| `wakaSelfhost.align` | left | 状态栏对齐 |
| `wakaSelfhost.alignPriority` | 1 | 对齐优先级 |

### 优先级

默认值 → `import_cfg` → `~/.waka-selfhost.cfg` → VS Code 设置。后面的覆盖前面的。

## 全部配置项（cfg 文件）

与官方 `wakatime-cli` 完全一致的 34 项：

| 配置项 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `api_key` | string | | API Key |
| `api_url` | string | | 服务端地址 |
| `api_key_vault_cmd` | string | | 从外部命令取 Key |
| `debug` | bool | false | 调试日志 |
| `heartbeat_rate_limit_seconds` | int | 120 | 心跳最小间隔，0 不限 |
| `exclude` | list | | 排除路径，POSIX 正则，逗号分隔 |
| `include` | list | | 强制记录，优先于 exclude |
| `include_only_with_project_file` | bool | false | 只统计含 `.wakatime-project` 的目录 |
| `exclude_unknown_project` | bool | false | 跳过没有项目的活动 |
| `hide_file_names` | bool/list | false | 隐藏文件名 |
| `hide_project_names` | bool/list | false | 隐藏项目名，生成 `anon-` 随机名 |
| `hide_branch_names` | bool/list | false | 隐藏分支名 |
| `hide_dependencies` | bool/list | false | 不上报依赖 |
| `hide_project_folder` | bool | false | 只发相对路径 |
| `status_bar_enabled` | bool | true | 显示状态栏 |
| `status_bar_coding_activity` | bool | false | 显示当前项目与文件 |
| `status_bar_show_categories` | bool | false | 按分类显示 |
| `status_bar_hide_minutes` | bool | false | 只显示小时 |
| `status_bar_max_categories` | int | 4 | 分类条数上限 |
| `offline` | bool | true | 离线队列 |
| `proxy` | string | | `http://` 或 `https://`，可带账号密码 |
| `no_ssl_verify` | bool | false | 跳过证书校验 |
| `ssl_certs_file` | string | | 自定义 CA |
| `timeout` | int | 30 | 请求超时秒数 |
| `hostname` | string | | 机器名，影响 `machine_name_id` |
| `log_file` | string | | 日志路径 |
| `import_cfg` | string | | 导入另一份 cfg |
| `metrics` | bool | false | 匿名使用统计（本实现未上报） |
| `guess_language` | bool | false | 按内容猜语言（未实现） |
| `sync_ai_disabled` | bool | false | 关闭 AI 会话日志扫描 |
| `exclude_ai` | list | | AI 日志里跳过这些路径 |
| `submodules_disabled` | list | | 跳过匹配的 submodule |

## 命令

| 命令 | 作用 |
| --- | --- |
| `设置服务端地址与 API Key` | 一步完成必要配置（推荐） |
| `设置 API URL` / `设置 API Key` / `设置代理` | 单独改某一项 |
| `切换调试模式` | 开关 debug |
| `暂停 / 恢复统计` | 临时停止上报 |
| `开关状态栏` | 显示或隐藏 |
| `状态栏显示当前项目` | 状态栏追加项目名 |
| `打开看板` | 浏览器打开服务端 |
| `打开配置文件` | 编辑 `~/.waka-selfhost.cfg` |
| `打开日志文件` | 看日志 |
| `诊断` | 输出生效配置 + `/healthz` 与 `/users/current` 连通性检查 |
| `立即扫描 AI 会话日志` | 手动触发 transcript 扫描 |
| `补传离线心跳` | 立即重发队列 |

## AI 会话日志

读本地会话日志，把 AI 改过的文件补发成带 `ai_line_changes` 的心跳。只读，不调用 AI 工具命令。

**支持 35 个工具**：

| 分组 | 工具 |
| --- | --- |
| Claude 系 | Claude、OpenClaude、CodeBuddy、Qwen Code、CodeWhale、DeepSeek |
| Codex 系 | Codex、Droid |
| Cline 系 | Cline、Roo Code、Kilo Code、Cline CLI |
| Gemini | Gemini |
| 通用 | Amp、Codebuff、Continue、Copilot CLI、Crush、Devin、Grok Build、IBM Bob、Kimi、Kimi Code、Kiro、LingTai TUI、Mistral Vibe、Mux、OMP、Open Design、OpenClaw、Pi、Quick Desktop、Zerostack、Cursor Agent、Forge |

**不支持（读 SQLite，扩展宿主无驱动）**：Cursor、Copilot、Windsurf、Cody、Goose、OpenCode、Qoder、Warp、Zed、ZCode、Hermes、Antigravity、Kiro DB、OpenCode v2、Gemini (Antigravity)、Cursor Agent DB。

每 60 秒增量扫描一次。`sync_ai_disabled = true` 关闭，`exclude_ai` 按正则排除。

## 远程开发

扩展声明 `extensionKind: ["workspace"]`，Remote-SSH / WSL / Dev Container 下它跑在**远端机器**上：

- `api_url` 必须是远端可达的地址，写 `localhost` 会连不上你本机
- `machine_name_id` 由 `hostname + remoteName + platform` 哈希，不同机器分开统计
- 状态栏会显示 `$(remote)` 前缀提醒

## 排障

### 状态栏提示对照

| 状态栏 | 含义 | 怎么办 |
| --- | --- | --- |
| `未配置服务地址` | 还没填 `api_url` | 运行「设置服务端地址与 API Key」 |
| `未配置 API Key` | 地址有了但没 Key | 同上 |
| `API Key 无效` | 服务端返回 401/403 | Key 复制不完整，或已被吊销 |
| `地址不对` | 服务端返回 404 | 地址漏了 `/v1`，或端口写错 |
| `连不上服务器` | 网络层失败 | 服务端没启动、端口没放行、地址不可达 |
| `服务端错误 5xx` | 服务端内部报错 | 看服务端日志 |

把鼠标悬停在状态栏上能看到具体错误和请求地址。

1. 命令面板运行 **waka-selfhost: 诊断**，看配置与连通性
2. 状态栏显示「未配置 API Key」→ 执行设置命令
3. 状态栏显示「连接失败」→ 检查 `api_url` 是否带 `/v1` 后缀、服务端是否可达
4. 状态栏显示「离线」→ 请求超时，检查网络或代理
5. 打开日志文件（`~/.wakatime/waka-selfhost.log`）看详细报错

## 数据去哪了

全部发到你自己部署的服务端，`data/waka.db`（SQLite）。插件不上报任何第三方。
