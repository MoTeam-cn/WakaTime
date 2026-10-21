import fs from "node:fs";
import path from "node:path";

export interface QueuedHeartbeat {
  entity: string;
  type: string;
  category: string;
  time: number;
  project: string | null;
  branch: string | null;
  language: string | null;
  lines: number | null;
  lineno: number | null;
  cursorpos: number | null;
  is_write: boolean;
  project_root_count: number | null;
  machine_name_id: string;
  dependencies?: string[];
  ai_line_changes?: number;
  human_line_changes?: number;
  ai_session?: string | null;
}

/** 离线队列：失败的心跳追加到本地 JSONL，网络恢复后按序补传 */
export class OfflineQueue {
  private file: string;
  private max = 5000;

  constructor(storageDir: string) {
    fs.mkdirSync(storageDir, { recursive: true });
    this.file = path.join(storageDir, "queue.jsonl");
  }

  get path(): string {
    return this.file;
  }

  append(item: QueuedHeartbeat): void {
    try {
      fs.appendFileSync(this.file, JSON.stringify(item) + "\n", "utf8");
    } catch {
      /* 忽略 */
    }
  }

  size(): number {
    try {
      return fs.readFileSync(this.file, "utf8").split("\n").filter((l) => l.trim().length > 0).length;
    } catch {
      return 0;
    }
  }

  take(limit: number): QueuedHeartbeat[] {
    let lines: string[] = [];
    try {
      lines = fs.readFileSync(this.file, "utf8").split("\n").filter((l) => l.trim().length > 0);
    } catch {
      return [];
    }
    const head = lines.slice(0, limit);
    const rest = lines.slice(limit);
    try {
      fs.writeFileSync(this.file, rest.length > 0 ? rest.join("\n") + "\n" : "", "utf8");
    } catch {
      /* 忽略 */
    }
    const out: QueuedHeartbeat[] = [];
    for (const line of head) {
      try {
        out.push(JSON.parse(line) as QueuedHeartbeat);
      } catch {
        /* 跳过坏行 */
      }
    }
    return out;
  }

  requeue(items: QueuedHeartbeat[]): void {
    if (items.length === 0) return;
    try {
      const existing = fs.existsSync(this.file) ? fs.readFileSync(this.file, "utf8") : "";
      const payload = items.map((i) => JSON.stringify(i)).join("\n") + "\n";
      fs.writeFileSync(this.file, payload + existing, "utf8");
    } catch {
      /* 忽略 */
    }
  }

  trim(): void {
    if (this.size() <= this.max) return;
    try {
      const lines = fs.readFileSync(this.file, "utf8").split("\n").filter((l) => l.trim().length > 0);
      fs.writeFileSync(this.file, lines.slice(lines.length - this.max).join("\n") + "\n", "utf8");
    } catch {
      /* 忽略 */
    }
  }
}

