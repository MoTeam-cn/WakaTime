import * as vscode from "vscode";

/** 官方监控的 AI 扩展（COMMON_AI_EXTENSIONS） */
export const AI_EXTENSIONS: { name: string; ids: string[] }[] = [
  { name: "codeium", ids: ["codeium.codeium"] },
  { name: "cody", ids: ["sourcegraph.cody-ai"] },
  { name: "continue", ids: ["continue.continue"] },
  { name: "factory", ids: [] },
  { name: "openclaw", ids: [] },
  { name: "supermaven", ids: ["supermaven.supermaven"] },
  { name: "tabnine", ids: ["tabnine.tabnine-vscode"] },
  { name: "vscode-ai-toolkit", ids: ["ms-vscode.vscode-ai-toolkit"] },
  { name: "copilot", ids: ["github.copilot", "github.copilot-chat"] },
  { name: "cursor", ids: ["cursor.cursor"] },
];

/** 检测本机装了哪些 AI 扩展 */
export function detectAIExtensions(): string[] {
  const found: string[] = [];
  for (const ai of AI_EXTENSIONS) {
    for (const id of ai.ids) {
      if (vscode.extensions.getExtension(id)) {
        found.push(ai.name);
        break;
      }
    }
  }
  return found;
}

/** 大块变更阈值：单次超过该行数且间隔很短，判定为 AI 生成 */
const AI_BURST_LINES = 30;
const AI_BURST_WINDOW_MS = 1500;

export class LineChangeTracker {
  private lastLines = new Map<string, number>();
  private ai = new Map<string, number>();
  private human = new Map<string, number>();
  private lastBurst = 0;

  /** 记录一次文档变更，返回本次是 AI 还是人工 */
  record(filePath: string, lineCount: number, now: number): "ai" | "human" {
    const prev = this.lastLines.get(filePath) ?? lineCount;
    const delta = lineCount - prev;
    this.lastLines.set(filePath, lineCount);
    if (delta <= 0) return "human";

    const isBurst = delta >= AI_BURST_LINES && now - this.lastBurst < AI_BURST_WINDOW_MS;
    if (delta >= AI_BURST_LINES) this.lastBurst = now;

    const key = filePath;
    if (isBurst) {
      this.ai.set(key, (this.ai.get(key) ?? 0) + delta);
      return "ai";
    }
    this.human.set(key, (this.human.get(key) ?? 0) + delta);
    return "human";
  }

  take(filePath: string): { aiLineChanges: number; humanLineChanges: number } {
    const ai = this.ai.get(filePath) ?? 0;
    const human = this.human.get(filePath) ?? 0;
    this.ai.set(filePath, 0);
    this.human.set(filePath, 0);
    return { aiLineChanges: ai, humanLineChanges: human };
  }

  forget(filePath: string): void {
    this.lastLines.delete(filePath);
    this.ai.delete(filePath);
    this.human.delete(filePath);
  }
}

