import type { QueuedHeartbeat } from "./offline.ts";
import type { OfflineQueue } from "./offline.ts";
import type { WakaConfig } from "./config-schema.ts";
import { requestJson } from "./http-client.ts";

export interface SendOutcome {
  ok: boolean;
  status: number;
  message: string;
}

export class HeartbeatSender {
  private queue: OfflineQueue;
  private log: (msg: string) => void;
  private lastError: string | null = null;

  constructor(queue: OfflineQueue, log: (msg: string) => void) {
    this.queue = queue;
    this.log = log;
  }

  private headers(config: WakaConfig): Record<string, string> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (config.apiKey) {
      headers["authorization"] = "Basic " + Buffer.from(config.apiKey, "utf8").toString("base64");
    }
    headers["user-agent"] = "vscode/1.85.0 waka-selfhost/0.2.0";
    return headers;
  }

  private httpOpts(config: WakaConfig) {
    return {
      proxy: config.proxy,
      timeoutMs: Math.max(5, config.timeout) * 1000,
      noSslVerify: config.noSslVerify,
    };
  }

  /** 发送一批心跳；失败入离线队列（offline 关闭时直接丢弃） */
  async send(config: WakaConfig, items: QueuedHeartbeat[]): Promise<SendOutcome> {
    if (items.length === 0) return { ok: true, status: 0, message: "空批次" };
    try {
      const res = await requestJson(
        "POST",
        config.apiUrl + "/users/current/heartbeats.bulk",
        JSON.stringify(items),
        this.headers(config),
        this.httpOpts(config)
      );
      if (res.status === 200 || res.status === 201 || res.status === 202) {
        this.lastError = null;
        if (config.debug) this.log("已发送 " + items.length + " 条心跳");
        return { ok: true, status: res.status, message: "ok" };
      }
      this.lastError = "HTTP " + res.status + " " + res.text.slice(0, 200);
      this.log("发送失败: " + this.lastError);
      if (res.status === 401 || res.status === 403) {
        return { ok: false, status: res.status, message: "凭据无效" };
      }
      if (config.offline) this.queue.requeue(items);
      return { ok: false, status: res.status, message: this.lastError };
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.log("发送异常: " + this.lastError);
      if (config.offline) this.queue.requeue(items);
      return { ok: false, status: 0, message: this.lastError };
    }
  }

  /** 补传离线队列，每批 25 条 */
  async flush(config: WakaConfig): Promise<number> {
    if (!config.offline) return 0;
    let sent = 0;
    for (let i = 0; i < 20; i++) {
      const batch = this.queue.take(25);
      if (batch.length === 0) break;
      const outcome = await this.send(config, batch);
      if (!outcome.ok) break;
      sent += batch.length;
    }
    this.queue.trim();
    return sent;
  }

  /** 诊断用：连通性检查 */
  async ping(config: WakaConfig): Promise<{ health: SendOutcome; auth: SendOutcome }> {
    const base = config.apiUrl.replace(/\/v1$/, "");
    let health: SendOutcome;
    try {
      const res = await requestJson("GET", base + "/healthz", undefined, {}, this.httpOpts(config));
      health = { ok: res.status === 200, status: res.status, message: res.text.slice(0, 120) };
    } catch (err) {
      health = { ok: false, status: 0, message: err instanceof Error ? err.message : String(err) };
    }

    let auth: SendOutcome;
    try {
      const res = await requestJson("GET", config.apiUrl + "/users/current", undefined, this.headers(config), this.httpOpts(config));
      auth = { ok: res.status === 200, status: res.status, message: res.text.slice(0, 160) };
    } catch (err) {
      auth = { ok: false, status: 0, message: err instanceof Error ? err.message : String(err) };
    }
    return { health, auth };
  }

  getLastError(): string | null {
    return this.lastError;
  }
}

