# waka-selfhost 设计文档

版本 v0.1 · 2026-10-21 · 状态：待确认后开工

---

## 1. 定位

自托管的 WakaTime 替代品。单一部署、多租户数据结构、不开放注册。三个交付物：服务端（Node 原生 + TypeScript）、VS Code 插件、GitHub Actions 工作流。

设计原则：

- 运行时零 npm 依赖（`node:http` / `node:sqlite` / `node:crypto` / `node:fs`），开发期只依赖 `typescript` 与 `@types/node`。
- 对 WakaTime 官方插件的兼容是硬验收：`wakatime.apiUrl` 填 `https://域名/v1` 即可上报并显示状态栏。
- 聚合算法写成纯函数放 `packages/core`，服务端与插件共用同一份实现，单测覆盖。
- 单进程、单 SQLite 文件、单端口，能 `docker run` 一把起。

## 2. 决策记录

| # | 决策项 | 结论 | 被否方案与原因 |
|---|---|---|---|
| 1 | 存储 | SQLite 单文件，WAL 模式，`node:sqlite` | MongoDB（官方做法，要额外服务）；JSONL（查询要自己写） |
| 2 | 租户模型 | 多租户数据结构，严格隔离，不做 orgs | orgs/团队看板（工作量约等于再做一个 WakaTime） |
| 3 | 注册 | 不开放。仅首次启动的 `/setup` 初始化页可创建第一个管理员 | 环境变量自动建号（不够直观）；bootstrap token（多一步操作） |
| 4 | 建号方式 | 管理页 + `/v1/admin/users`，无 CLI 依赖 | CLI 命令（Docker 容器内跑不了） |
| 5 | 登录 | `POST /v1/session`，发 JWT | 仅 Cookie session（插件用不了） |
| 6 | JWT | access 2h（HS256 无状态）+ refresh 30d（存 DB 可吊销，登录时旋转） | 单 token 7d/30d（网页端反复重登或长期不可吊销） |
| 7 | 插件凭据 | 两者都接受：`Basic base64(api_key)` 与 `Bearer <JWT>` | 只 JWT（官方插件不认）；只 API Key（自写插件灵活性差） |
| 8 | API 前缀 | 无 `/api`，全部 `/v1/...` | `/api/v1`（不必要的一层；官方插件 apiUrl 可整体替换，不受影响） |
| 9 | 读接口鉴权 | Bearer JWT / Basic API Key / `?api_key=` 三种 | 仅 Bearer（curl 与第三方卡片不便） |
| 10 | OAuth | 不做 | 做最小 authorize/token（单人场景无收益，将来要接第三方再补） |
| 11 | 前端 | 服务端直出 HTML + 手写 SVG，零构建，纯黑白灰 | Vite SPA（多一套构建链）；图表库（体积与依赖） |
| 12 | 工程 | npm workspaces + `node:test` + 单端口 8800 | pnpm/vitest（多装东西）；分端口（要配 CORS） |
| 13 | 镜像 | Dockerfile 多阶段构建，发布到 GHCR，不推 Docker Hub | 只给裸 Node（部署麻烦）；推 Docker Hub（用户明确不需要） |
| 14 | 目录 | `Common\waka-selfhost` | — |

## 3. 架构

```
┌──────────────┐   HTTPS    ┌─────────────────────────────────────┐
│ VS Code 插件 │───────────▶│  waka-selfhost (单进程, :8800)      │
│ 官方插件     │  /v1/...   │  ┌───────────────────────────────┐  │
└──────────────┘            │  │ http 层: 路由/鉴权/限流/日志  │  │
┌──────────────┐            │  ├───────────────────────────────┤  │
│ 浏览器       │◀──────────▶│  │ api 层: 心跳/时长/汇总/管理   │  │
│ (黑白前端)   │   HTML     │  ├───────────────────────────────┤  │
└──────────────┘            │  │ service: 聚合/时区/审计       │  │
┌──────────────┐            │  ├───────────────────────────────┤  │
│ GitHub Action│───────────▶│  │ store: sqlite 仓储层          │  │
│ (统计卡片)   │  /v1/...   │  └───────────────┬───────────────┘  │
└──────────────┘            │                  │ /data/waka.db     │
                            └──────────────────┼───────────────────┘
                                               ▼
                                        SQLite (WAL)
```

请求链路：`http/router` 匹配路由 → `auth` 解析身份（JWT / API Key / Cookie）→ `api/handler` 校验参数 → `service` 执行业务 → `store` 读写 SQLite → `http/respond` 统一出 JSON（含 gzip、错误包装）。

## 4. 目录结构

```
waka-selfhost/
├─ package.json                 # npm workspaces 根，scripts: build/test/typecheck
├─ tsconfig.base.json
├─ docs/
│   ├─ design.md                # 本文件
│   └─ api-contract.md          # 端点契约与兼容性验收清单
├─ packages/core/               # 纯逻辑，零 import，服务端/插件/Action 共用
│   └─ src/
│       ├─ types.ts             # Heartbeat / Duration / Summary 等类型
│       ├─ heartbeat.ts         # 校验、规范化、去重键
│       ├─ aggregate.ts         # 心跳 → 时长（纯函数）
│       ├─ summary.ts           # 时长 → 日/项目/语言/编辑器汇总
│       ├─ format.ts            # 数字格式化（digital/text/decimal）
│       └─ language.ts          # languageId → WakaTime 语言名映射表
├─ apps/server/
│   └─ src/
│       ├─ main.ts              # 启动、配置、优雅退出
│       ├─ config.ts            # 环境变量解析与默认值
│       ├─ http/                # server.ts router.ts auth.ts respond.ts rate-limit.ts log.ts
│       ├─ api/                 # session.ts setup.ts heartbeats.ts durations.ts summaries.ts
│       │                       #   stats.ts status-bar.ts projects.ts meta.ts admin.ts web.ts
│       ├─ service/             # aggregate.ts timezone.ts audit.ts user.ts apikey.ts
│       ├─ store/               # db.ts migrate.ts users.ts heartbeats.ts durations.ts keys.ts
│       └─ web/                 # layout.ts 页面模板 + svg.ts 图表 + tokens.css
├─ extensions/vscode/           # 纯 TS 扩展，不下载 wakatime-cli
│   └─ src/  extension.ts heartbeat.ts config.ts project.ts offline.ts statusbar.ts
├─ .github/workflows/           # ci.yml release.yml stats-card.yml
├─ Dockerfile
└─ compose.yaml
```

## 5. 数据模型

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id            TEXT PRIMARY KEY,              -- uuid
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,                 -- scrypt$N$r$p$salt$hash
  role          TEXT NOT NULL DEFAULT "member",-- admin | member
  timezone      TEXT NOT NULL DEFAULT "Asia/Shanghai",
  disabled      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE sessions (                        -- refresh token，可吊销
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,           -- sha256(refresh token)
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  revoked_at   INTEGER,
  user_agent   TEXT,
  ip           TEXT
);

CREATE TABLE api_keys (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  prefix       TEXT NOT NULL,                  -- 前 8 位，列表展示用
  key_hash     TEXT NOT NULL UNIQUE,           -- sha256(完整 key)
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at   INTEGER
);

CREATE TABLE heartbeats (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity        TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT "file",
  category      TEXT,
  time          REAL NOT NULL,                 -- epoch 秒，带小数
  project       TEXT,
  project_root_count INTEGER,
  branch        TEXT,
  language      TEXT,
  dependencies  TEXT,
  lines         INTEGER,
  lineno        INTEGER,
  cursorpos     INTEGER,
  is_write      INTEGER NOT NULL DEFAULT 0,
  machine_name_id TEXT,
  user_agent    TEXT,
  editor        TEXT,
  os            TEXT,
  ai_line_changes INTEGER,
  human_line_changes INTEGER,
  ai_session    TEXT,
  ai_input_tokens INTEGER,
  ai_output_tokens INTEGER,
  ai_prompt_length INTEGER,
  ai_subscription_plan TEXT,
  created_at    INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_hb_dedup ON heartbeats(user_id, entity, time);
CREATE INDEX ix_hb_user_time ON heartbeats(user_id, time);

CREATE TABLE durations (                       -- 聚合结果缓存，可随时重算
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_time     REAL NOT NULL,
  end_time       REAL NOT NULL,
  duration       REAL NOT NULL,                -- 秒
  project        TEXT,
  branch         TEXT,
  language       TEXT,
  category       TEXT,
  entity         TEXT,
  is_write       INTEGER,
  num_heartbeats INTEGER NOT NULL,
  machine_name_id TEXT,
  day            TEXT NOT NULL                 -- 用户时区 YYYY-MM-DD
);
CREATE INDEX ix_dur_user_day ON durations(user_id, day);
CREATE INDEX ix_dur_user_start ON durations(user_id, start_time);

CREATE TABLE audit_logs (
  id         TEXT PRIMARY KEY,
  user_id    TEXT,                             -- 主体（登录失败时为空）
  action     TEXT NOT NULL,                    -- login.ok / login.fail / user.create / key.create ...
  target     TEXT,
  ip         TEXT,
  user_agent TEXT,
  meta       TEXT,                             -- JSON
  created_at INTEGER NOT NULL
);
CREATE INDEX ix_audit_time ON audit_logs(created_at);

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- setup_completed / jwt_secret / schema_version / aggregate_cursor:<user_id>
```

隔离规则：`store` 层每个函数签名强制首参 `userId: string`，SQL 里 `WHERE user_id = ?` 由构造函数统一注入，禁止出现无 userId 条件的查询（代码评审硬规则）。

## 6. 认证与授权

### 6.1 初始化（仅一次）

1. 启动时读 `meta.setup_completed`；为空且 `users` 表 0 行 → 所有页面与 API（除 `/setup`、`/v1/setup`、`/healthz`）返回 302 到 `/setup`。
2. `GET /setup` 渲染黑白表单：用户名、密码、确认密码、时区（默认 `Asia/Shanghai`）。
3. `POST /v1/setup` 在 `BEGIN IMMEDIATE` 事务内再次校验 `COUNT(users)=0`，创建 `role=admin` 用户，写 `meta.setup_completed=1`。并发或重复调用返回 409。
4. 成功后 302 到 `/login`。此路由此后永久返回 409。

### 6.2 密码

`scrypt`（`node:crypto`），N=16384 / r=8 / p=1 / dkLen=64，存为 `scrypt$16384$8$1$<salt_b64>$<hash_b64>`；校验用 `timingSafeEqual`。密码最短 10 位，不允许等于用户名。

### 6.3 JWT

- access：HS256，2 小时。payload `sub`(user id) / `username` / `role` / `jti` / `iat` / `exp` / `typ:"access"`。
- secret：优先 `JWT_SECRET` 环境变量；未设置则首次启动生成 32 字节随机值写入 `meta.jwt_secret` 并在日志告警。
- refresh：32 字节随机串（非 JWT），DB 只存 sha256，30 天，**每次刷新旋转**（旧记录立即 `revoked_at`）。
- 登录响应体：`access_token` / `token_type:"Bearer"` / `expires_in:7200` / `refresh_token` / `user`。
- 同时下发两个 HttpOnly Cookie（`waka_at` / `waka_rt`，`SameSite=Lax`，`Secure` 由 `PUBLIC_URL` 是否 https 决定），供网页端使用；插件用响应体里的 Bearer。

### 6.4 API Key

- 生成 `waka_` + 32 字节 base62，只在创建响应里明文出现一次；DB 存 sha256 与前 8 位 `prefix`。
- 每用户可建多个、可命名、可单独吊销（对齐「完整」方案）。
- 认证时接受三种形态：`Authorization: Basic base64(key)`、`Authorization: Bearer waka_...`、`?api_key=`。

### 6.5 身份解析顺序

1. `Authorization: Bearer` 且形如三段点分 → 按 JWT 校验；校验失败 → 401（不回退）。
2. `Authorization: Bearer waka_...` → 按 API Key 查表。
3. `Authorization: Basic` → 解 base64 后按 API Key 查表。
4. `?api_key=` → 按 API Key 查表。
5. Cookie `waka_at` → 按 JWT 校验（网页用）。

命中后得到 `AuthContext { userId, role, via }`。`role` 只影响 `/v1/admin/*`；其余端点一律以 `userId` 做数据过滤，admin 也不例外（除管理端点显式指定目标用户）。

### 6.6 审计日志

记录：登录成功/失败、登出、初始化、建号/改密/改角色/禁用/删除、API Key 创建/吊销、数据删除与导出、管理端点全部调用。**不记录心跳**（量大）。保留 90 天，`housekeeping` 定时清理。

### 6.7 防护

- 登录失败：同 IP 5 次 / 5 分钟 → 429（内存计数，单进程足够）。
- 全局限流：每 token 平均 < 10 req/s（5 分钟滑动窗口），超限 429。
- 心跳 body 上限 1 MB，单次最多 25 条（对齐官方限制）。
- 所有 SQL 参数化；所有用户输入按长度与字符集校验。

## 7. 心跳与聚合

### 7.1 上报

`POST /v1/users/current/heartbeats.bulk` 接受数组（≤25），逐条：

1. 必填校验：`entity`、`time`；`type` 缺省 `file`；`category` 缺省按 type 推断。
2. 规范化：`entity` 反斜杠转正斜杠；`dependencies` 数组转逗号串；`time` 转 float。
3. 从 `User-Agent` 解析 `editor` 与 `os`（形如 `vscode/1.90.0 vscode-wakatime/30.2.1`）。
4. `INSERT OR IGNORE`（命中 `ux_hb_dedup` 即视为重复，不报错，返回 201）。
5. 若新心跳时间早于该用户已聚合水位 → 删除水位之后的 `durations` 行并置脏标记。
6. 响应 `{ "responses": [[null, 201], ...] }`，逐条对应。

### 7.2 聚合（心跳 → 时长）

纯函数 `aggregate(heartbeats, options)`，输入按 `time` 升序，输出 `Duration[]`：

```
options = { timeout: 900, maxGap: 0, tz: "Asia/Shanghai", groupBy: ["project","branch","language","category"] }

prev = null
for hb of heartbeats:
    day = localDay(hb.time, tz)
    key = groupKey(hb)
    if prev == null:
        prev = newDuration(hb, day, key, duration=0)
        push(prev); continue
    gap = hb.time - (prev.startTime + prev.duration)
    if gap < 0: gap = 0                      // 乱序容错
    if maxGap > 0 && gap > maxGap: gap = maxGap
    if gap >= timeout or key != prev.key or day != prev.day:
        prev = newDuration(hb, day, key, duration=0)
        push(prev)
    else:
        prev.duration += gap
        prev.numHeartbeats += 1
        prev.endTime = hb.time
        prev.entity = prominentEntity(prev, hb)   // 保留停留最久的文件

if output.length == 1 && input.length == 1: output[0].duration = 0
```

边界规则：

- 跨天必须切分（日界按用户时区），否则 summaries 与 durations 对不上账。
- 单心跳 → 时长 0，不补 timeout。
- `timeout` 默认 900s，可被请求参数 `timeout` 覆盖（WakaTime 语义）。
- `maxGap` 默认 0（不封顶）。若日后要与官方口径严格对齐，可设 120 并重算全量对比。
- 聚合按用户分批，`meta.aggregate_cursor:<user_id>` 记录已聚合水位，避免每次全量。

### 7.3 与官方口径的对齐与校准

总时长由两个变量决定：**心跳密度**（客户端）与**切分规则**（服务端）。前者照抄官方常量即可，后者用公开实现对齐。

| 变量 | 官方取值（源码实测） | 本项目 |
|---|---|---|
| 心跳最小间隔（同文件无写入） | `TIME_BETWEEN_HEARTBEATS_MS = 120000` | 同值 |
| 事件防抖 | `debounceMs = 50` | 同值 |
| 发送缓冲 | `SEND_BUFFER_SECONDS = 30` | 同值 |
| 状态栏刷新 | `fetchTodayInterval = 60000` | 同值 |
| 服务端超时切分 | 15 分钟（公开文档口径） | `timeout = 900` |
| 单间隔封顶 | 未公开 | `maxGap = 0`（不封顶），可配 |

**能保证的**：同一批心跳输入，产出的每日总秒数与语言分布与官方同量级同结构。
**不能保证的**：官方服务端未开源，durations 的 entity 权重与并行项目处理细节未知，秒级完全一致做不到。

校准三步：

1. 单测：构造心跳序列（跨天、单心跳、乱序、多项目并行、语言切换）→ 断言时长。
2. 历史回放：从官方 `data_dumps` 导出原始心跳 JSON，导入自建库重算，与官方 `summaries` 逐日比对总秒数，误差 <1% 视为口径一致。
3. 并行一周：官方插件报官方云，自写插件报自建，同一批操作比对。

交付一个 `scripts/compare.ts`：输入两份 summaries JSON，输出「日期 / 官方秒数 / 本地秒数 / 差值 / 偏差率」表。

### 7.4 语言维度统计

语言时长不是独立统计，而是 duration 的分组维度：分组键为 `(project, branch, language, category)`。

- 在 TypeScript 文件停留 10 分钟 → 一条 duration，`language=TypeScript`。
- 切到 Vue 文件 → language 变 → 立即切分出新 duration。
- 切到终端或浏览器（`category=browsing`、无 language）→ 又切分，且**不计入语言榜**。

由此产生三条必须写进前端说明的行为：

1. **语言榜总和 ≠ 总时长**，差额来自无语言活动（浏览、终端、调试、AI 会话）。这是 WakaTime 本身的行为。
2. 同语言两个文件之间切换不切分（`entity` 不在分组键内），所以语言时长准确、单文件时长是启发式近似（保留停留最久的 entity）。
3. 语言名必须归一：`ts` / `typescript` / `TypeScript` 合并为同一项。做法是直接从 `wakatime-cli` 的 `pkg/heartbeat/language_gen.go` 生成映射表，保证与官方榜单同名同分；未知语言归 `Other`。

客户端不传 `language` 则该心跳不计入任何语言——自写插件必须实现映射表，官方 CLI 已内置。

### 7.5 汇总

`summarize(durations, tz)` 产出 WakaTime 结构：`grand_total`、`categories`、`projects`、`languages`、`editors`、`operating_systems`、`machines`、`branches`、`dependencies`。每个条目含 `name` / `total_seconds` / `text` / `hours` / `minutes` / `digital` / `decimal` / `percent`。

数字格式：`total_seconds` 取整；`text` 形如 `1 hr 30 mins`；`digital` 形如 `1:30`；`decimal` 两位小数；`percent` 两位小数。

## 8. API 契约

完整字段与示例见 `docs/api-contract.md`。路径总览：

| 分组 | 端点 |
|---|---|
| 初始化 | `POST /v1/setup` |
| 会话 | `POST /v1/session`、`GET /v1/session`、`POST /v1/session/refresh`、`DELETE /v1/session` |
| 上报 | `POST /v1/users/current/heartbeats.bulk`、`POST /v1/users/current/heartbeats` |
| 读取 | `GET /v1/users/current/status_bar/today`、`/durations`、`/summaries`、`/stats/:range`、`/all_time_since_today`、`/machine_names`、`/user_agents`、`/projects`、`/v1/users/current` |
| 兼容杂项 | `GET /v1/plugins`、`GET /v1/meta` |
| 密钥 | `GET/POST/DELETE /v1/users/current/api_keys[/:id]` |
| 管理 | `GET/POST /v1/admin/users`、`PATCH/DELETE /v1/admin/users/:id`、`POST /v1/admin/users/:id/password`、`GET /v1/admin/audit` |
| 健康 | `GET /healthz` |
| 明确不实现 | `goals`、`custom_rules`、`leaderboards`、`insights`、`orgs`、`data_dumps`、`file_experts`、`external_durations` → 统一 404 + `{"error":"not_implemented"}` |

错误格式统一：`{"error":"<机器码>","message":"<中文说明>"}`。机器码：`unauthorized`、`forbidden`、`not_found`、`invalid_request`、`rate_limited`、`conflict`、`setup_closed`、`not_implemented`、`server_error`。

## 9. 前端

### 9.1 页面

| 路径 | 说明 | 鉴权 |
|---|---|---|
| `/setup` | 首次初始化表单 | 仅当无用户 |
| `/login` | 登录 | 公开 |
| `/` | 今日：总时长 + 分类/项目/语言/编辑器 + 状态栏式摘要 | 需登录 |
| `/stats?range=7d|30d|all` | 趋势柱状图 + 排行（项目/语言/分支/机器） | 需登录 |
| `/settings` | 时区、改密、API Key 管理（新建/吊销/复制一次） | 需登录 |
| `/admin/users` | 用户列表、建号、重置密码、禁用、改角色 | admin |
| `/admin/audit` | 审计日志分页 | admin |

### 9.2 视觉规范（纯黑白）

```
--bg:#ffffff  --fg:#000000  --muted:#888888  --line:#e5e5e5  --hover:#f5f5f5
暗色（可选，prefers-color-scheme）：--bg:#000000 --fg:#ffffff --muted:#999999 --line:#222222 --hover:#111111
字体：system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif
数字：font-variant-numeric: tabular-nums；标题用 font-weight:600
间距：8 的倍数；最大内容宽度 960px；无圆角或 2px 圆角；无阴影；分隔用 1px 实线
```

### 9.3 图表（手写 SVG，零依赖）

- 趋势柱状图：`viewBox="0 0 W H"`，柱宽按天数自适应，最高值归一；柱用 `--fg` 填充，非当前日可用 30% 透明度。
- 排行榜：水平条（宽度按百分比），条右侧标 `text` 时长。
- 环形图：`stroke-dasharray` 分段，最多 6 段，其余归「其他」。
- 全部为 SSR 输出，禁用 JS 也能读；只有 range 切换用少量 JS（无 JS 时退化为链接跳转）。

## 10. VS Code 插件

自写插件用于摆脱 `wakatime-cli` 二进制下载（官方插件最常见的故障源）。

- 配置：`wakaSelfhost.apiKey` / `apiUrl`（默认 `http://localhost:8800/v1`）/ `statusBarEnabled` / `debug` / `disabled` / `ignore` / `exclude` / `include` / `hideCategories`。
- 命令：设置 API Key、设置 API 地址、打开看板、开关状态栏、开关调试日志、查看日志。
- 心跳触发（对齐官方 v30.2.1 实测常量）：`onDidChangeTextDocument` 触发后 50ms 防抖（`debounceMs = 50`）；真正发送需满足任一条件——本次是写入、距上次心跳超过 `TIME_BETWEEN_HEARTBEATS_MS = 120000`（2 分钟）、切换文件、调试状态变化、编译状态变化、AI 生成状态变化。
- 节流：同文件且无写入时最短 2 分钟一条；文件切换立即发。心跳先入 30 秒缓冲（`SEND_BUFFER_SECONDS = 30`）再批量 POST；状态栏每 60 秒刷新（`fetchTodayInterval = 60000`）。
- 项目：向上找 `.git` 目录名；存在 `.wakatime-project` 则取其内容；多根工作区按文件夹分别判定。
- 分支：直接读 `.git/HEAD` 与 `packed-refs`，不依赖 git 二进制。
- 语言：`core/language.ts` 的 `languageId → 语言名` 映射，未知则按扩展名兜底。
- 离线：失败写 `globalStorage/queue.jsonl`，恢复后按时间序补传，服务端靠唯一索引去重。
- 状态栏：本地算今日时长，60s 刷新；点击打开看板。
- 凭据：优先 API Key（`Basic`），也接受 JWT（`Bearer`）。

## 11. GitHub Actions

| 工作流 | 触发 | 内容 |
|---|---|---|
| `ci.yml` | push / PR | ubuntu-latest：`npm ci` → `typecheck` → `test`（node:test）→ `docker build`（不推送）→ `vsce package` 产物上传 |
| `release.yml` | tag `v*` | 多架构 buildx 构建，推送 `ghcr.io/<owner>/waka-selfhost:<tag>` 与 `:latest`，用 `GITHUB_TOKEN` + `permissions: packages: write` |
| `stats-card.yml` | 每日 cron + 手动 | 拉 `/v1/users/current/summaries`（`READ` 用 API Key 存 repo secret）→ 生成黑白 SVG → 提交 README；服务端不可达则跳过且不失败 |

本机只有 PS 5.1 且不支持 `&&`，本地脚本一律分行；POSIX 相关验证只在 CI 的 ubuntu 上做。

## 12. Docker 与部署

- 多阶段：`node:24-alpine` 构建（`npm ci` + `tsc`）→ 运行阶段仅拷 `dist` 与 `node_modules` 生产部分，非 root 用户 `node`，`EXPOSE 8800`。
- 数据卷 `/data`（`waka.db`、`waka.db-wal`、`waka.log`）。
- 环境变量：`PORT`（默认 8800）、`DATA_DIR`（默认 `/data`）、`JWT_SECRET`、`TZ`、`PUBLIC_URL`（决定 Cookie 是否 Secure）、`LOG_LEVEL`。
- `HEALTHCHECK` 打 `GET /healthz`。
- `compose.yaml`：单服务 + 具名卷 + `restart: unless-stopped`。
- 发布只走 GHCR，不推 Docker Hub。
- 注意：本机无 Docker/WSL，镜像构建与运行只能由 CI 的 ubuntu 验证，本地仅静态推演。

## 13. 里程碑与验收

| 阶段 | 内容 | 验收标准 |
|---|---|---|
| M0 | monorepo 骨架、`core` 类型与 `aggregate`/`summary`/`format` + 单测、本两份文档 | `node --test` 全绿；算法用例覆盖跨天、单心跳、乱序、多项目并行 |
| M1 | SQLite 建表与迁移、`/setup`、`/v1/session` 登录/JWT/refresh、API Key、审计 | 空库启动跳 `/setup`；建号后 `/login` 成功拿到 access+refresh；refresh 旋转生效；Key 可建可吊销 |
| M2 | `heartbeats.bulk` 上报 + 幂等去重 + 聚合缓存 + 补传回滚 | 重复上报不重复计时；补传历史后 `durations` 与全量重算一致 |
| M3 | 读接口：`durations` / `summaries` / `stats` / `status_bar/today` / `all_time_since_today` / `machine_names` / `user_agents` / `projects` / `plugins` | **官方 VS Code 插件把 `wakatime.apiUrl` 指向 `https://host/v1` 后能上报，状态栏显示今日时长** |
| M4 | 前端全部页面 + 手写 SVG 图表 + 黑白规范 | 无 JS 时页面仍可读；`/admin/users` 可建号并立即登录 |
| M5 | VS Code 插件（上报、状态栏、离线队列、命令） | 卸载官方插件、不装 wakatime-cli，纯插件可完整上报 |
| M6 | `ci.yml` / `release.yml`（GHCR）/ `stats-card.yml`、Dockerfile、compose | tag 推送后 GHCR 有镜像；卡片每日自动更新；服务端宕机时 workflow 不失败 |

## 14. 风险与待定

1. **CLI 硬编码路径**：若 `wakatime-cli` 内部某处写死 `api.wakatime.com/api/v1`（如插件更新检查），去掉 `/api` 后该请求会 404。M3 实测确认，必要时对该路径做兼容别名 `GET /api/v1/plugins` 302 到 `/v1/plugins`。
2. **时区与夏令时**：日界按 `Intl` 计算，DST 地区跨天切分需用例覆盖（默认 `Asia/Shanghai` 无 DST）。
3. **SQLite 并发**：单进程写无竞争；`node:sqlite` 在 Node 24 仍标 experimental，升级 Node 需回归。
4. **数据迁移**：从官方 WakaTime 迁历史数据不在本期范围，M6 之后可用 `data_dumps` 导入器补。
5. **审计日志增长**：90 天保留 + 定时清理，避免单文件无限膨胀。

## 15. 实施状态（2026-10-21）

| 里程碑 | 状态 | 证据 |
|---|---|---|
| M0 骨架 + core 纯函数 + 单测 | 完成 | `packages/core` 6 个模块；22 项断言全过（聚合/跨天/乱序/语言切分/格式化/语言归一/心跳归一） |
| M1 SQLite + 认证 | 完成 | `/v1/setup`、JWT 登录、refresh 旋转、多 API Key、审计日志；冒烟覆盖 |
| M2 上报 + 聚合 | 完成 | `heartbeats.bulk` 幂等去重（重复上报仍 4 条）、脏区重算 |
| M3 读接口 + 官方插件兼容 | 完成 | status_bar/durations/summaries/stats/all_time/machine_names/user_agents/projects/plugins 全部 200；`/api/v1/plugins` 兼容别名 |
| M4 黑白前端 | 完成 | 今日/统计/设置/用户/审计五页 SSR，统计页含手写 SVG，禁用 JS 可读 |
| M5 VS Code 插件 | 完成（未实机装） | 7 个文件：配置、项目识别、语言映射、离线队列、发送器、状态栏、主入口 |
| M6 CI / GHCR / Action / Docker | 完成（未在 CI 跑过） | `ci.yml`、`release.yml`、`stats-card.yml`、`Dockerfile`、`compose.yaml` |

本地验证结果：

- 语法检查：54 个 TS 文件全部通过 `stripTypeScriptTypes`
- 单元断言：22 / 22
- 端到端冒烟：32 / 32（真实 HTTP + 真实 SQLite，含越权、去重、token 旋转、页面渲染）
- 未能验证：`tsc -b`（本机子进程被沙箱禁止）、Docker 构建（本机无 Docker）、插件实机安装

已知缺口：

1. `apps/server/src/api/read.ts` 的 `stats` 未实现 `is_including_today` 参数（当前固定含今天）。
2. 插件未实现 AI 字段采集（`ai_line_changes` 等），服务端已支持存储与透传。
3. `scripts/stats-card.ts` 未在真实 Action 中跑过。
