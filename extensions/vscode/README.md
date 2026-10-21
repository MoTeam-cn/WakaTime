# waka-selfhost

把你自己的编码活动上报到**自建的 WakaTime 兼容服务端**。不下载、不调用 `wakatime-cli`，全部 TypeScript 实现。

> 本扩展只是客户端，需要先部署 [waka-selfhost 服务端](https://github.com/Mo-cn/WakaTime)。

## 为什么用它

- **不依赖官方 CLI**：官方插件会下载一个 Go 二进制，出问题时很难查；这个扩展是纯 JS，出错日志一眼看到
- **配置兼容**：直接读 `~/.wakatime.cfg` 的全部 34 个配置项，从官方插件迁移只改 `api_url`
- **数据在你自己机器上**：服务端是单文件 SQLite，随时备份、随时搬走

## 快速开始

1. 部署服务端，浏览器打开后首次访问会引导你创建管理员
2. 登录后在「设置」里生成 API Key（`waka_` 开头）
3. 在 VS Code 里配置：

命令面板（`Ctrl+Shift+P`）运行 **waka-selfhost: 设置 API URL**，填入：

```
http://你的服务器:8800/v1
```

再运行 **waka-selfhost: 设置 API Key** 粘贴 Key。

也可以直接写配置文件 `~/.wakatime.cfg`，和官方 CLI 共用同一份：

```ini
[settings]
api_url = http://192.168.1.10:8800/v1
api_key = waka_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

配置完状态栏会出现今日编码时长。

## 功能

| 能力 | 说明 |
| --- | --- |
| 语言识别 | 1023 条映射 / 793 个官方语言名 |
| 依赖检测 | 16 种包清单（package.json、go.mod、requirements.txt、Cargo.toml、pom.xml…） |
| 项目识别 | 不依赖 git 二进制，读 `.git/HEAD`；支持多根工作区与 `.wakatime-project` |
| 隐私 | 隐藏文件名 / 项目名 / 分支名 / 依赖，隐藏值用 sha256 占位 |
| 过滤 | POSIX 正则 `exclude` / `include` |
| 状态栏 | 五种模式：时长、当前项目、分类明细、隐藏分钟、错误态 |
| AI 会话日志 | 读 Claude Code、Codex、Cline、Gemini 等 **35 个工具**的本地会话，补发 AI 改动 |
| 离线 | 失败心跳写本地队列，5 分钟自动补传 |
| 代理 | `http://` / `https://`（含账号密码） |
| 远程开发 | Remote-SSH / WSL / 容器下跑在远端，机器标识按机器区分 |

## 命令

| 命令 | 作用 |
| --- | --- |
| `waka-selfhost: 设置 API URL` | 写入 `api_url` |
| `waka-selfhost: 设置 API Key` | 写入 `api_key` |
| `waka-selfhost: 设置代理` | 写入 `proxy` |
| `waka-selfhost: 切换调试模式` | 开关 `debug` |
| `waka-selfhost: 暂停 / 恢复统计` | 临时停止上报 |
| `waka-selfhost: 开关状态栏` | 显示或隐藏 |
| `waka-selfhost: 状态栏显示当前项目` | 状态栏追加项目名 |
| `waka-selfhost: 打开看板` | 浏览器打开服务端 |
| `waka-selfhost: 打开配置文件` | 编辑 `~/.wakatime.cfg` |
| `waka-selfhost: 打开日志文件` | 看日志 |
| `waka-selfhost: 诊断` | 输出生效配置 + 连通性检查 |
| `waka-selfhost: 立即扫描 AI 会话日志` | 手动触发 transcript 扫描 |
| `waka-selfhost: 补传离线心跳` | 立即重发队列 |

## 远程开发注意

扩展声明 `extensionKind: ["workspace"]`，所以在 Remote-SSH / WSL / Dev Container 里它跑在**远端机器**上。`api_url` 必须是远端可达的地址——用 `localhost` 会连不上你本机的服务端。状态栏会显示 `$(remote)` 前缀提醒。

## 已知限制

- 读 SQLite 的 AI 工具暂不支持（Cursor、Copilot、Windsurf 等 16 个），因为扩展宿主没有 sqlite 驱动
- SOCKS 与 NTLM 代理未实现

## License

Apache-2.0
