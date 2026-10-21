# API 契约 · waka-selfhost v1

配套文档：`design.md`。本文件是服务端实现的验收依据。

## 0. 通用约定

- 基址：`https://<host>/v1`，**无 `/api` 前缀**。
- 传输：仅 HTTPS（反代终结 TLS）。
- 请求/响应：`application/json; charset=utf-8`，>1KB 响应 gzip。
- 时间：心跳 `time` 为 epoch 秒（float）；其余时间字段为 ISO 8601 UTC 字符串。
- 分页：`page`（默认 1）、`per_page`（默认 20，上限 100），响应含 `page` / `total` / `total_pages`。
- 错误：HTTP 状态码 + `{"error":"<机器码>","message":"<说明>"}`。

| 机器码 | 状态码 | 场景 |
|---|---|---|
| `unauthorized` | 401 | 无凭据或凭据无效 |
| `forbidden` | 403 | 凭据有效但无权访问该资源 |
| `not_found` | 404 | 资源不存在 |
| `invalid_request` | 400 | 参数缺失/类型错误/超限 |
| `rate_limited` | 429 | 触发限流 |
| `conflict` | 409 | 唯一性冲突 |
| `setup_closed` | 409 | 初始化已完成，`/v1/setup` 已关闭 |
| `not_implemented` | 404 | 明确不实现的 WakaTime 端点 |
| `server_error` | 500 | 未捕获异常 |

鉴权顺序见 `design.md` 6.5：Bearer(JWT) → Bearer(API Key) → Basic(API Key) → `?api_key=` → Cookie。

---

## 1. 初始化

### POST /v1/setup

仅当 `users` 表为空时可用。

请求：

```json
{ "username": "xiaomo", "password": "至少10位", "timezone": "Asia/Shanghai" }
```

响应 201：

```json
{ "data": { "id": "uuid", "username": "xiaomo", "role": "admin", "timezone": "Asia/Shanghai" } }
```

失败：409 `setup_closed`（已初始化）、400 `invalid_request`（密码过短等）。

---

## 2. 会话

### POST /v1/session  （登录）

请求：

```json
{ "username": "xiaomo", "password": "******" }
```

响应 200：

```json
{
  "data": {
    "access_token": "eyJhbGciOi...",
    "token_type": "Bearer",
    "expires_in": 7200,
    "refresh_token": "rt_9f2c...",
    "user": { "id": "uuid", "username": "xiaomo", "role": "admin", "timezone": "Asia/Shanghai" }
  }
}
```

同时下发 `Set-Cookie: waka_at=<jwt>; HttpOnly; SameSite=Lax; Path=/` 与 `waka_rt=<refresh>; HttpOnly; SameSite=Lax; Path=/v1/session`。

失败：401 `unauthorized`；429 `rate_limited`（同 IP 5 次/5 分钟）。

### GET /v1/session  （当前登录态）

响应 200：

```json
{ "data": { "id": "uuid", "username": "xiaomo", "role": "admin", "timezone": "Asia/Shanghai", "via": "jwt" } }
```

### POST /v1/session/refresh

请求体可空（用 Cookie `waka_rt`），或：

```json
{ "refresh_token": "rt_9f2c..." }
```

响应 200：新的 `access_token` + 新的 `refresh_token`（旧的立即吊销）。

### DELETE /v1/session  （登出）

吊销当前 refresh，清 Cookie。响应 204。

---

## 3. 心跳上报

### POST /v1/users/current/heartbeats.bulk

鉴权：API Key（Basic/Bearer/`?api_key=`）或 JWT。数组上限 25 条，body 上限 1 MB。

请求：

```json
[
  {
    "entity": "C:/Users/XiaoMo/project/src/main.ts",
    "type": "file",
    "category": "coding",
    "time": 1761033600.123,
    "project": "waka-selfhost",
    "branch": "main",
    "language": "TypeScript",
    "lines": 420,
    "lineno": 88,
    "cursorpos": 12,
    "is_write": true,
    "project_root_count": 6,
    "dependencies": ["node:http", "typescript"],
    "machine_name_id": "uuid"
  }
]
```

响应 201：

```json
{ "responses": [[null, 201], [null, 201]] }
```

规则：

- `entity`、`time` 必填；`type` 缺省 `file`；`category` 缺省按 type 推断。
- `entity` 反斜杠统一转 `/`；`dependencies` 数组转逗号串存储。
- 重复心跳（同 user + entity + time）不报错，仍返回 201。
- `editor` / `os` 从 `User-Agent` 解析，如 `vscode/1.90.0 vscode-wakatime/30.2.1`。

### POST /v1/users/current/heartbeats

单条上报，body 为上面的对象。响应 201 `{"data": {...}}`。

---

## 4. 读取

### GET /v1/users/current/status_bar/today

参数：`editor`（可选）、`project`（可选）、`branch`（可选）。官方插件状态栏依赖此端点。

响应 200：

```json
{
  "data": {
    "grand_total": { "total_seconds": 5400.0, "hours": 1, "minutes": 30, "text": "1 hr 30 mins", "digital": "1:30", "decimal": "1.50" },
    "categories": [ { "name": "Coding", "total_seconds": 5400.0, "text": "1 hr 30 mins", "percent": 100.0 } ],
    "editors":    [ { "name": "VS Code", "total_seconds": 5400.0, "text": "1 hr 30 mins", "percent": 100.0 } ],
    "languages":  [ { "name": "TypeScript", "total_seconds": 3600.0, "text": "1 hr", "percent": 66.67 } ],
    "projects":   [ { "name": "waka-selfhost", "total_seconds": 5400.0, "text": "1 hr 30 mins", "percent": 100.0 } ],
    "branches":   [ { "name": "main", "total_seconds": 5400.0, "text": "1 hr 30 mins", "percent": 100.0 } ],
    "dependencies": [], "machines": [], "operating_systems": [],
    "range": { "date": "2026-10-21", "text": "Today", "timezone": "Asia/Shanghai" }
  }
}
```

### GET /v1/users/current/durations

参数：`date`（必填，YYYY-MM-DD，用户时区）、`project`、`branches`、`timeout`、`slice_by`（`entity`/`branch`/`language`/`dependencies`/`operating_system`/`machine`/`project`）、`writes_only`。

响应 200：

```json
{
  "data": [
    [ 120.5, { "entity": "...", "type": "file", "category": "coding", "time": 1761033600.123, "project": "waka-selfhost", "branch": "main", "language": "TypeScript", "is_write": false } ]
  ],
  "start": "2026-10-20T16:00:00Z",
  "end": "2026-10-21T15:59:59Z",
  "timezone": "Asia/Shanghai"
}
```

### GET /v1/users/current/summaries

参数：`start`（YYYY-MM-DD）、`end`（YYYY-MM-DD）、`project`、`branches`、`timeout`、`writes_only`、`timezone`。缺省 `start`=7 天前、`end`=今天。

响应 200：

```json
{
  "data": [
    {
      "grand_total": { "total_seconds": 5400.0, "hours": 1, "minutes": 30, "text": "1 hr 30 mins", "digital": "1:30", "decimal": "1.50" },
      "categories": [], "dependencies": [], "editors": [], "languages": [],
      "machines": [], "operating_systems": [], "projects": [], "branches": [], "entities": [],
      "range": { "date": "2026-10-21", "text": "2026-10-21", "timezone": "Asia/Shanghai" }
    }
  ],
  "cumulative_total": { "total_seconds": 5400.0, "text": "1 hr 30 mins", "digital": "1:30", "decimal": "1.50" },
  "start": "2026-10-15T00:00:00Z",
  "end": "2026-10-21T23:59:59Z"
}
```

### GET /v1/users/current/stats/:range

`:range` ∈ `last_7_days` / `last_30_days` / `last_6_months` / `last_year` / `all_time`。参数 `is_including_today`。

响应 200 `data` 含：`total_seconds`、`daily_average`、`days_including_holidays`、`best_day`、`categories`、`editors`、`languages`、`machines`、`operating_systems`、`projects`、`branches`、`range`。

### GET /v1/users/current/all_time_since_today

```json
{ "data": { "text": "123 hrs 45 mins", "total_seconds": 445500.0, "range": { "date": "2024-01-01", "text": "2024-01-01", "timezone": "Asia/Shanghai" } } }
```

### GET /v1/users/current/machine_names

`{"data": [{"id":"uuid","name":"DESKTOP-XXX","ip":"","last_seen_at":"2026-10-21T10:00:00Z","timezone":"Asia/Shanghai"}]}`

### GET /v1/users/current/user_agents

`{"data": [{"id":"vscode/1.90.0 vscode-wakatime/30.2.1","editor":"vscode","version":"1.90.0","os":"windows","last_seen_at":"..."}]}`

### GET /v1/users/current/projects

参数 `q`（搜索）、分页。`{"data":[{"id":"...","name":"waka-selfhost","repository":null,"url":null,"last_heartbeat_at":"..."}]}`

### GET /v1/users/current

当前用户信息（不含密码哈希）。

---

## 5. 兼容杂项

### GET /v1/plugins

官方插件用于检查自身更新。响应 200：

```json
{ "data": [ { "id": "vscode", "name": "Visual Studio Code", "version": "30.2.1", "released": true, "hidden": false, "history_url": "", "url": "" } ] }
```

实现策略：返回一份静态清单（内含官方插件当前版本），保证插件不报错即可。

### GET /v1/meta

`{"data":{"hostname":"waka-selfhost","version":"0.1.0","server_time":"2026-10-21T10:00:00Z"}}`

---

## 6. API Key 管理（自有扩展，非 WakaTime 契约）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/v1/users/current/api_keys` | 列表，只返回 `prefix` 与元信息 |
| POST | `/v1/users/current/api_keys` | body `{"name":"laptop"}`，响应**仅此一次**返回明文 `key` |
| DELETE | `/v1/users/current/api_keys/:id` | 吊销 |

响应示例：

```json
{ "data": { "id": "uuid", "name": "laptop", "prefix": "waka_9f2c", "key": "waka_9f2c...（只出现这一次）", "created_at": "2026-10-21T10:00:00Z" } }
```

---

## 7. 管理端点（role=admin）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/v1/admin/users` | 用户列表（分页） |
| POST | `/v1/admin/users` | `{"username","password","role","timezone"}` 建号 |
| PATCH | `/v1/admin/users/:id` | 改 `role` / `timezone` / `disabled` |
| POST | `/v1/admin/users/:id/password` | 重置密码 |
| DELETE | `/v1/admin/users/:id` | 删除用户（级联删心跳/时长/密钥/会话） |
| GET | `/v1/admin/audit` | 审计日志，参数 `action`、`user_id`、`from`、`to`、分页 |

保护规则：不能删除自己；不能把最后一个 admin 降级或禁用。

---

## 8. 明确不实现（统一 404 + `not_implemented`）

`goals`、`goals/:goal`、`custom_rules`、`custom_rules_progress`、`leaderboards`、`insights/:type/:range`、`orgs`、`data_dumps`、`file_experts`、`external_durations`、`projects/:project/commits`、`stats/2025`（年度归档）。

---

## 9. 兼容性验收清单（M3 必须全过）

1. VS Code 安装官方扩展 `WakaTime.vscode-wakatime`，`settings.json` 设：
   - `"wakatime.apiKey": "waka_xxx"`
   - `"wakatime.apiUrl": "https://<host>/v1"`
   - `"wakatime.debug": true`
2. 打开任意文件敲几行 → 插件日志出现 `201 Created` 且无 401/404。
3. 服务端 `heartbeats` 表出现该条记录，`editor` = `vscode`，`os` = `windows`。
4. 状态栏 60 秒内出现今日时长。
5. 关网 3 分钟再开网 → 离线队列补传成功，`heartbeats` 无重复行（唯一索引生效）。
6. 把 `apiUrl` 改错一位 → 插件报错但不崩溃；改回后恢复上报。
7. `curl -H "Authorization: Basic base64(waka_xxx)" https://<host>/v1/users/current/status_bar/today` 返回 200。
8. `curl "https://<host>/v1/users/current/summaries?start=2026-10-15&end=2026-10-21&api_key=waka_xxx"` 返回 200。

若第 2 步出现 404，检查是否为 `/api/v1/plugins` 硬编码路径，按 `design.md` 风险 1 加兼容别名。
