import type { QueuedHeartbeat } from "./offline.ts";

/** 心跳缓冲：攒够 30 秒或 25 条再发，减少请求数（对齐官方 SEND_BUFFER_SECONDS = 30） */
export class HeartbeatBuffer {
  private items: QueuedHeartbeat[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly flushMs: number;
  private readonly maxSize: number;
  private readonly onFlush: (items: QueuedHeartbeat[]) => void;

  constructor(onFlush: (items: QueuedHeartbeat[]) => void, flushMs = 30_000, maxSize = 25) {
    this.onFlush = onFlush;
    this.flushMs = flushMs;
    this.maxSize = maxSize;
  }

  push(item: QueuedHeartbeat): void {
    this.items.push(item);
    if (this.items.length >= this.maxSize) {
      this.flush();
      return;
    }
    if (this.timer === null) {
      this.timer = setTimeout(() => this.flush(), this.flushMs);
    }
  }

  flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.items.length === 0) return;
    const batch = this.items;
    this.items = [];
    this.onFlush(batch);
  }

  get size(): number {
    return this.items.length;
  }

  dispose(): void {
    this.flush();
  }
}

