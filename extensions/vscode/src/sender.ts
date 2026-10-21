import type { QueuedHeartbeat } from "./offline.ts";
import type { OfflineQueue } from "./offline.ts";
import type { WakaConfig } from "./config.ts";

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
    headers["user-agent"] = "vscode/1.85.0 waka-selfhost/" + "0.1.0";
    return headers;
  }

  /** 发送一批心跳；失败则入离线队列 */
  async send(config: WakaConfig, items: QueuedHeartbeat[]): Promise<boolean> {
    if (items.length === 0) return true;
    try {
      const res = await fetch(config.apiUrl + "/users/current/heartbeats.bulk", {
        method: "POST",
        headers: this.headers(config),
        body: JSON.stringify(items),
      });
      if (res.status === 201 || res.status === 200 || res.status === 202) {
        this.lastError = null;
        if (config.debug) this.log("sent " + items.length + " heartbeats");
        return true;
      }
      const text = await res.text();
      this.lastError = "HTTP " + res.status + " " + text.slice(0, 200);
      this.log("send failed: " + this.lastError);
      if (res.status === 401 || res.status === 403) return true;
      this.queue.requeue(items);
      return false;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.log("send error: " + this.lastError);
      this.queue.requeue(items);
      return false;
    }
  }

  /** 补传离线队列，每批 25 条 */
  async flush(config: WakaConfig): Promise<number> {
    let sent = 0;
    for (let i = 0; i < 20; i++) {
      const batch = this.queue.take(25);
      if (batch.length === 0) break;
      const okFlag = await this.send(config, batch);
      if (!okFlag) break;
      sent += batch.length;
    }
    this.queue.trim();
    return sent;
  }

  getLastError(): string | null {
    return this.lastError;
  }
}

