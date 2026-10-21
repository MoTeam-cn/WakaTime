import * as vscode from "vscode";
import type { WakaConfig } from "./config-schema.ts";
import { requestJson } from "./http-client.ts";

export interface StatusContext {
  project: string | null;
  file: string | null;
  remote: boolean;
}

interface TodayPayload {
  grand_total?: { text?: string; hours?: number; minutes?: number; total_seconds?: number };
  categories?: { name: string; text: string }[];
}

function trimMinutes(text: string): string {
  return text.replace(/\s*\d+\s*mins?/i, "").trim() || text;
}

export class StatusBar {
  private item: vscode.StatusBarItem;
  private timer: ReturnType<typeof setInterval> | null = null;
  private log: (msg: string) => void;
  private getContext: () => StatusContext;
  private lastError: string | null = null;

  constructor(log: (msg: string) => void, getContext: () => StatusContext) {
    this.log = log;
    this.getContext = getContext;
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    this.item.command = "wakaSelfhost.openDashboard";
    this.item.text = "$(clock) --";
  }

  applyLayout(config: WakaConfig): void {
    this.item.dispose();
    const alignment = config.align === "right" ? vscode.StatusBarAlignment.Right : vscode.StatusBarAlignment.Left;
    this.item = vscode.window.createStatusBarItem(alignment, config.alignPriority);
    this.item.command = "wakaSelfhost.openDashboard";
    this.item.text = "$(clock) --";
  }

  start(config: WakaConfig): void {
    if (config.statusBarEnabled) this.item.show();
    else this.item.hide();
    this.stop();
    this.timer = setInterval(() => void this.refresh(config), 60_000);
    void this.refresh(config);
  }

  async refresh(config: WakaConfig): Promise<void> {
    if (!config.statusBarEnabled) {
      this.item.hide();
      return;
    }
    this.item.show();

    const ctx = this.getContext();
    if (!config.apiKey) {
      this.item.text = "$(clock) 未配置 API Key";
      this.item.tooltip = "运行命令 waka-selfhost: 设置 API Key";
      return;
    }

    let payload: TodayPayload | null = null;
    try {
      const res = await requestJson(
        "GET",
        config.apiUrl + "/users/current/status_bar/today",
        undefined,
        { authorization: "Basic " + Buffer.from(config.apiKey, "utf8").toString("base64") },
        { proxy: config.proxy, timeoutMs: Math.max(5, config.timeout) * 1000, noSslVerify: config.noSslVerify }
      );
      if (res.status !== 200) {
        this.lastError = "HTTP " + res.status;
        this.item.text = "$(clock) 连接失败";
        return;
      }
      const parsed = JSON.parse(res.text) as { data?: TodayPayload };
      payload = parsed.data ?? null;
      this.lastError = null;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.log("状态栏刷新失败: " + this.lastError);
      this.item.text = "$(clock) 离线";
      return;
    }

    const totalText = payload?.grand_total?.text ?? "0 secs";
    let text = config.statusBarHideMinutes ? trimMinutes(totalText) : totalText;

    if (config.statusBarShowCategories) {
      const cats = (payload?.categories ?? []).slice(0, Math.max(1, config.statusBarMaxCategories));
      if (cats.length > 0) text = cats.map((c) => c.name + " " + (config.statusBarHideMinutes ? trimMinutes(c.text) : c.text)).join(" · ");
    }

    if (config.statusBarCodingActivity) {
      const activity = ctx.project ? ctx.project + (ctx.file ? " · " + ctx.file : "") : ctx.file ?? "";
      if (activity.length > 0) text = text + "  ·  " + activity;
    }

    if (ctx.remote) text = "$(remote) " + text;

    this.item.text = "$(clock) " + text;
    this.item.tooltip = [
      "今日编码时长：" + totalText,
      ctx.project ? "项目：" + ctx.project : "",
      ctx.file ? "文件：" + ctx.file : "",
      ctx.remote ? "远程环境：请求从远端机器发出" : "",
      "点击打开看板",
    ]
      .filter((l) => l.length > 0)
      .join("\n");
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  dispose(): void {
    this.stop();
    this.item.dispose();
  }
}

