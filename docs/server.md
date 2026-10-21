# 服务端部署与运维

## Docker（推荐）

镜像在 GHCR，私有包需要先登录：

```bash
docker login ghcr.io -u Mo-cn
```

```bash
docker run -d --name wakatime \
  --restart unless-stopped \
  -p 8800:8800 \
  -v waka-data:/data \
  -e PUBLIC_URL=http://192.168.1.10:8800 \
  -e JWT_SECRET=换成一串随机字符 \
  -e TZ=Asia/Shanghai \
  ghcr.io/moteam-cn/wakatime:latest
```

浏览器打开 `http://192.168.1.10:8800` → 自动跳 `/setup` 创建管理员。

### 用南大 GHCR 代理（国内推荐）

南京大学镜像站提供 GHCR 代理，无需登录、无需翻墙：

```bash
docker run -d --name wakatime \
  --restart unless-stopped \
  -p 8800:8800 \
  -v waka-data:/data \
  -e PUBLIC_URL=http://192.168.1.10:8800 \
  -e JWT_SECRET=换成一串随机字符 \
  ghcr.nju.edu.cn/moteam-cn/wakatime:0.3.4
```

规则就是把 `ghcr.io/` 换成 `ghcr.nju.edu.cn/`。

**前提**：镜像包必须是 public。在 https://github.com/orgs/MoTeam-cn/packages/container/wakatime/settings 底部把可见性改成 Public，否则代理返回 404。

也可以用 `docker tag` 换成官方名字再跑：

```bash
docker pull ghcr.nju.edu.cn/moteam-cn/wakatime:0.3.4
docker tag ghcr.nju.edu.cn/moteam-cn/wakatime:0.3.4 ghcr.io/moteam-cn/wakatime:0.3.4
```

### 用南大 Docker Hub 源自建

南大镜像站 `https://docker.nju.edu.cn` 只能加速 Docker Hub 的基础镜像，GHCR 的镜像不在里面。要自建：

`/etc/docker/daemon.json`：

```json
{
  "registry-mirrors": ["https://docker.nju.edu.cn"]
}
```

```bash
sudo systemctl restart docker
git clone https://github.com/MoTeam-cn/WakaTime.git
cd WakaTime
docker build -t waka-selfhost:latest .
docker run -d --name wakatime --restart unless-stopped \
  -p 8800:8800 -v waka-data:/data waka-selfhost:latest
```

### compose

```bash
docker compose up -d
```

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | 8800 | 监听端口 |
| `HOST` | 0.0.0.0 | 监听地址 |
| `DATA_DIR` | `/data` | 数据目录（镜像内） |
| `DB_PATH` | `$DATA_DIR/waka.db` | SQLite 路径 |
| `LOG_PATH` | `$DATA_DIR/waka.log` | 日志路径 |
| `PUBLIC_URL` | 空 | 对外地址；`https://` 开头时登录 Cookie 自动加 Secure |
| `JWT_SECRET` | 空 | 不设则每次重启 token 失效，建议设置 |
| `ACCESS_TOKEN_TTL` | 7200 | 访问令牌秒数 |
| `REFRESH_TOKEN_TTL` | 2592000 | 刷新令牌秒数（30 天） |
| `TZ` | Asia/Shanghai | 统计时区 |
| `LOG_LEVEL` | info | debug / info / warn / error |
| `HEARTBEAT_TIMEOUT` | 900 | 心跳断点秒数 |
| `MAX_GAP_SECONDS` | 0 | 单次间隔上限，0 不限制 |
| `TRUST_PROXY` | true | 反代后面保持 true |

## 本地开发

```bash
npm install
npx tsc -b
node apps/server/dist/main.js
```

开发态直接跑 TypeScript（Node 24 原生类型剥离）：

```bash
npm run dev      # 启动服务端
npm test         # 单元测试
npm run smoke    # 进程内冒烟
npm run e2e      # 真实进程端到端
```

## 统计口径

- 心跳按 `(project, branch, language, category)` 分组
- 相邻心跳间隔小于 `HEARTBEAT_TIMEOUT`（默认 900 秒）才累加
- 跨天、切组、超时都断开，单独成段
- 单条心跳时长为 0
- 每段只保留停留时间最长的那个 entity
- 语言是分组维度之一，所以语言榜合计小于总时长（浏览器、终端这类没有语言的活动不计入语言榜）
- 心跳按 `entity + time + project` 去重，重复上报不会算两遍

## 静态资源与缓存

前端不用构建工具，CSS 由服务端直出：

| 路径 | 缓存策略 | 说明 |
| --- | --- | --- |
| `/assets/app.css?v=<版本>` | `public, max-age=31536000, immutable` | 一年强缓存，版本变了 URL 就变，CDN 不会给旧样式 |
| 所有 HTML 页面 | `no-cache` | 每次都验证，避免 CDN 缓存住旧页面 |

版本号优先级：环境变量 `APP_VERSION` → 向上查找 `name` 为 `waka-selfhost` 的 `package.json` 的 `version` → 兜底 `dev`。

所以升级镜像后 URL 自动变成 `?v=新版本`，用户浏览器与 CDN 都会立刻拉新样式。

## 数据与备份

全部数据在一个 SQLite 文件里。

```bash
# 备份
docker run --rm -v waka-data:/data -v $PWD:/backup alpine \
  tar czf /backup/waka-backup.tar.gz -C /data .

# 恢复
docker run --rm -v waka-data:/data -v $PWD:/backup alpine \
  tar xzf /backup/waka-backup.tar.gz -C /data
```

## 目录结构

```
packages/core/        纯逻辑：心跳归一、时长聚合、统计口径、语言表
apps/server/          HTTP 服务、SQLite、认证、前端页面
extensions/vscode/    VS Code 扩展
scripts/              冒烟、E2E、语言表生成、统计卡
docs/                 文档
```

## 已知限制

- `stats` 未实现 `is_including_today` 参数（固定含今天）
- goals / custom_rules / leaderboards / insights / orgs / data_dumps / file_experts / external_durations 未实现，统一返回 404 `not_implemented`
- 官方服务端不开源，秒级完全一致无法保证，用 `npm run compare` 校准
