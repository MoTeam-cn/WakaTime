# waka-selfhost

自托管的 WakaTime 替代品。Node 原生 + TypeScript，运行时零 npm 依赖（node:http / node:sqlite / node:crypto）。

- 服务端：单进程、单 SQLite 文件、单端口；API 与 WakaTime 兼容（官方 VS Code 插件把 apiUrl 指过来即可用）
- 前端：服务端直出 HTML + 手写 SVG，纯黑白，禁用 JS 也能读
- 插件：自带 VS Code 扩展，功能面对齐官方插件与 wakatime-cli，但**不下载也不调用 CLI**，全部 TypeScript 实现
- 多租户：不开放注册，首个账号走 /setup，其余由管理员在后台创建

## 快速开始

```bash
npm install
npx tsc -b
node apps/server/dist/main.js
```

浏览器打开 http://localhost:8800 → 首次跳到 /setup 创建管理员 → 登录后在「设置」里建 API Key。

开发态直接跑 TypeScript（Node 24 原生类型剥离）：

```bash
npm run dev     # 启动服务端
npm test        # 单元测试
npm run smoke   # 端到端冒烟（真实 HTTP + 内存库）
```

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| PORT | 8800 | 监听端口 |
| DATA_DIR | ./data | 数据目录（waka.db、waka.log） |
| DB_PATH | DATA_DIR/waka.db | SQLite 路径，:memory: 用于测试 |
| JWT_SECRET | 自动生成存库 | 生产环境务必显式设置 |
| TZ | Asia/Shanghai | 新用户默认时区 |
| PUBLIC_URL | 空 | 填 https 地址后 Cookie 带 Secure |
| LOG_LEVEL | info | debug / info / warn / error |
| HEARTBEAT_TIMEOUT | 900 | 相邻心跳超过该秒数即断开 |
| MAX_GAP_SECONDS | 0 | 单次间隔上限，0 表示不封顶 |

## 接官方 VS Code 插件

在 settings.json 中：

```json
{
  "wakatime.apiKey": "waka_你创建的密钥",
  "wakatime.apiUrl": "http://localhost:8800/v1",
  "wakatime.debug": true
}
```

注意 apiUrl 要带 /v1、不带 /api。官方 CLI 的 base URL 是整体替换的，去掉 /api 前缀不影响兼容。

## 用自己的插件

`extensions/vscode` 是一个不依赖 `wakatime-cli` 的 VS Code 扩展，功能面对齐官方插件 v30.2.1：

| 能力 | 说明 |
| --- | --- |
| 语言识别 | 1023 条映射 / 793 个官方语言名，由 `npm run gen:languages` 从 wakatime-cli 源生成 |
| 配置 | 兼容 `~/.wakatime.cfg` 全部 34 个配置项，VS Code 设置优先覆盖 |
| 事件源 | 文本变更、选区、可见区域、切换编辑器、可见编辑器、窗口焦点、保存、笔记本变更/保存、终端 |
| 依赖检测 | 16 种包清单（package.json、go.mod、requirements.txt、Cargo.toml、pom.xml、Gemfile、pubspec.yaml、*.csproj …），上限 100 条 |
| 项目识别 | 不依赖 git 二进制，读 `.git/HEAD` 与 `packed-refs`；支持多根工作区、`.wakatime-project` |
| 隐私 | `hide_file_names` / `hide_project_names` / `hide_branch_names` / `hide_dependencies` / `hide_project_folder`，隐藏值用 sha256 前 8 位 |
| 过滤 | `exclude` / `include` 用 POSIX 正则，`include` 优先 |
| 状态栏 | 五种模式：时长、当前项目、分类明细、隐藏分钟、错误态；支持左右对齐 |
| AI 采集 | 检测 10 类 AI 扩展，上报 `ai_line_changes` / `human_line_changes` |
| 远程开发 | 声明 `extensionKind: ["workspace"]`，Remote-SSH / WSL / 容器下跑在远端，`machine_name_id` 按机器区分 |
| 代理 | `http://` / `https://`（含账号密码），CONNECT 隧道实现，无第三方依赖 |
| 离线 | 失败心跳写 JSONL，5 分钟自动补传，可 `offline = false` 关闭 |
| 诊断 | 一条命令输出生效配置、依赖、日志路径与双连通性检查 |

构建与安装：

```bash
cd extensions/vscode
npm run build        # 编译到 dist/
npx vsce package --no-dependencies   # 生成 .vsix
```

然后在 VS Code 里 `Ctrl+Shift+P` → `Extensions: Install from VSIX`。

首次配置两种方式，任选其一：

```bash
# 方式一：编辑器设置（命令面板搜索 waka-selfhost: 设置 API URL）
# 方式二：写官方配置文件，与 wakatime-cli 共用同一份
```

```ini
[settings]
api_url = http://192.168.1.10:8800/v1
api_key = waka_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
debug = false
```

远程开发注意：插件在远端工作区里运行，请求从远端机器发出，`api_url` 必须是远端可达的地址。状态栏会显示 `$(remote)` 前缀，日志里也会写明。

SOCKS 与 NTLM 代理未实现，配置后会在日志里给出明确错误。

## API

基址 https://<host>/v1，无 /api 前缀。完整契约见 docs/api-contract.md。

| 分组 | 端点 |
|---|---|
| 初始化 | POST /v1/setup |
| 会话 | POST/GET/DELETE /v1/session、POST /v1/session/refresh |
| 上报 | POST /v1/users/current/heartbeats.bulk |
| 读取 | status_bar/today、durations、summaries、stats/:range、all_time_since_today、machine_names、user_agents、projects |
| 密钥 | GET/POST/DELETE /v1/users/current/api_keys |
| 管理 | GET/POST /v1/admin/users、PATCH/DELETE /v1/admin/users/:id、GET /v1/admin/audit |
| 健康 | GET /healthz |

鉴权顺序：Bearer(JWT) → Bearer(API Key) → Basic base64(key) → ?api_key= → Cookie。

## Docker

```bash
docker compose up -d
```

镜像发布到 GHCR（不推 Docker Hub），打 tag 后由 release.yml 构建 linux/amd64 与 linux/arm64：

```
docker pull ghcr.io/mo-cn/wakatime:latest
```

仓库是私有的，拉取前先登录（用带 read:packages 的 PAT）：

```
docker login ghcr.io -u Mo-cn
```

## 统计口径

时长 = 心跳间隔累加，不是编辑器开启时长。

- 同文件无写入时最短 2 分钟一条心跳（对齐官方 TIME_BETWEEN_HEARTBEATS_MS = 120000）
- 服务端按 (project, branch, language, category) 分组，相邻间隔 < 15 分钟累加，跨天/跨组切分
- 单条心跳时长为 0
- 语言榜总和通常小于总时长：终端、浏览器等活动没有语言标记

校准：npm run compare -- official.json local.json，逐日比对总秒数与偏差率。

## 目录

```
packages/core       纯逻辑（聚合/汇总/格式化/语言映射），零依赖
apps/server         Node 原生服务端（http/sqlite/crypto）
extensions/vscode   VS Code 插件（不依赖 wakatime-cli）
scripts             smoke / stats-card / compare
docs                design.md 与 api-contract.md
```

## 已知限制

- node:sqlite 在 Node 24 仍标 experimental，升级 Node 需回归
- 官方服务端不开源，秒级完全一致无法保证，用 compare 的偏差率校准
- 未实现 goals / custom_rules / leaderboards / insights / orgs / data_dumps / file_experts / external_durations，统一 404 not_implemented


## License

Apache License 2.0，见 [LICENSE](LICENSE)。

本项目是 WakaTime 的独立自托管实现，与 WakaTime Inc. 无关联；"WakaTime" 仅用于说明 API 兼容目标。
