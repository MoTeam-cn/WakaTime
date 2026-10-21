# waka-selfhost

把编码活动上报到**自建的 WakaTime 兼容服务端**。不下载、不调用 `wakatime-cli`，纯 TypeScript 实现。

> 需要先部署服务端：[github.com/MoTeam-cn/WakaTime](https://github.com/MoTeam-cn/WakaTime)

## 三步开始

1. 部署服务端，浏览器打开后按引导创建管理员，在「设置」里生成 API Key（`waka_` 开头）
2. 命令面板（`Ctrl+Shift+P`）运行 **waka-selfhost: 设置服务端地址与 API Key**
3. 依次填服务端地址（`http://你的服务器:8800/v1`）和 API Key

状态栏出现今日时长即成功。

也可以直接写 `~/.waka-selfhost.cfg`，与官方 CLI 共用同一份配置：

```ini
[settings]
api_url = http://192.168.1.10:8800/v1
api_key = waka_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## 与官方插件共存

本扩展使用**独立配置文件** `~/.waka-selfhost.cfg`，不碰官方的 `~/.wakatime.cfg`。两个插件可以同时安装、各报各的，互不干扰。

## 主要特性

- 语言识别 1023 条映射 / 793 个官方语言名
- 配置兼容 `~/.waka-selfhost.cfg` 全部 34 项，编辑器设置优先
- 依赖检测 16 种包清单，项目识别不依赖 git 二进制
- 状态栏五种模式，隐私四项 `hide_*`，POSIX 正则过滤
- 读 35 个 AI 工具的会话日志，补发 AI 改动
- 离线队列自动补传，支持 HTTP 代理与远程开发

## 文档

完整说明（全部命令、配置项、AI 工具清单、远程开发、排障）：

**[docs/plugin.md](https://github.com/MoTeam-cn/WakaTime/blob/main/docs/plugin.md)**

## 已知限制

- 读 SQLite 的 AI 工具暂不支持（Cursor、Copilot、Windsurf 等 16 个）
- SOCKS 与 NTLM 代理未实现

## License

Apache-2.0
