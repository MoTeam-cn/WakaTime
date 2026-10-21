<div align="center">

<img src="docs/icon.png" width="96" alt="waka-selfhost">

# waka-selfhost

自托管的 WakaTime 替代品。Node 原生 + TypeScript，运行时零 npm 依赖。

</div>

## 是什么

WakaTime 收紧了 API Key 的访问方式，这个项目让你把编码统计拿回自己手里。

- **服务端**：单进程、单 SQLite 文件、单端口，API 与 WakaTime 兼容
- **前端**：服务端直出 HTML + 手写 SVG，纯黑白，禁用 JS 也能读
- **插件**：自带 VS Code 扩展，功能对齐官方插件但不依赖 `wakatime-cli`
- **多租户**：不开放注册，首个账号走 `/setup`，其余由管理员创建

## 快速开始

```bash
docker run -d --name wakatime --restart unless-stopped \
  -p 8800:8800 -v waka-data:/data \
  -e PUBLIC_URL=http://localhost:8800 \
  ghcr.io/moteam-cn/wakatime:latest
```

浏览器打开 `http://localhost:8800` → 按引导创建管理员 → 在「设置」生成 API Key。

插件：市场搜索 **waka-selfhost**，或 `code --install-extension MoTeam.waka-selfhost`。

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/server.md](docs/server.md) | 部署、环境变量、统计口径、备份、目录结构 |
| [docs/plugin.md](docs/plugin.md) | 插件全部命令、34 个配置项、AI 工具清单、远程开发、排障 |
| [docs/api-contract.md](docs/api-contract.md) | 接口契约与错误码 |
| [docs/design.md](docs/design.md) | 设计决策与实现说明 |

## 接官方插件

官方 VS Code 插件也能用，把 `apiUrl` 指向你的服务端即可（去掉 `/api` 前缀是刻意的，官方 CLI 的 `--api-url` 可替换）：

```json
{ "wakatime.apiUrl": "http://192.168.1.10:8800/v1" }
```

## License

Apache-2.0
