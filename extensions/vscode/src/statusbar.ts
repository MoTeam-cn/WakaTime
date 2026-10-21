import * as vscode from "vscode";
import type { WakaConfig } from "./config.ts";
import { readConfig } from "./config.ts";

export class StatusBar {
  private item: vscode.StatusBarItem;
  private timer: ReturnType<typeof setInterval> | null = null;
  private log: (msg: string) => void;

  constructor(log: (msg: string) => void) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    this.item.command = "wakaSelfhost.openDashboard";
    this.item.text = "$(clock) --";
    this.log = log;
  }

  start(config: WakaConfig): void {
    if (config.statusBarEnabled) this.item.show();
    else this.item.hide();
    this.stop();
    this.timer = setInterval(() => {
      void this.refresh();
    }, 60_000);
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const config = readConfig();
    if (!config.statusBarEnabled) {
      this.item.hide();
      return;
    }
    this.item.show();
    if (!config.apiKey) {
      this.item.text = "$(clock) 未配置 API Key";
      return;
    }
    try {
      const res = await fetch(config.apiUrl + "/users/current/status_bar/today", {
        headers: { authorization: "Basic " + Buffer.from(config.apiKey, "utf8").toString("base64") },
      });
      if (!res.ok) {
        this.item.text = "$(clock) 连接失败";
        return;
      }
      const payload = (await res.json()) as { data?: { grand_total?: { text?: string } } };
      const text = payload.data?.grand_total?.text ?? "0 secs";
      this.item.text = "$(clock) " + text;
      this.item.tooltip = "今日编码时长（点击打开看板）";
    } catch (err) {
      this.log("status bar refresh failed: " + String(err));
      this.item.text = "$(clock) 离线";
    }
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

