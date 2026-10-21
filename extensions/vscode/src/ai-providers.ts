import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type ProviderKind = "claude" | "codex" | "cline" | "gemini" | "generic";

export interface ProviderDef {
  /** 稳定标识，用于状态键 */
  id: string;
  /** 展示名，写进心跳的 tool 字段 */
  name: string;
  /** 解析策略 */
  kind: ProviderKind;
  /** 相对 home 的目录（可含 * 通配），也支持绝对路径；可传函数以便按 home 惰性求值 */
  roots: string[] | ((home: string) => string[]);
  /** 文件名匹配 */
  fileMatch: RegExp;
  /** 是否要求内容里出现该标记才解析（可选，用于降噪） */
  requireHint?: RegExp;
}

/** Linux/macOS 的 XDG 数据目录 */
export function dataHome(home: string): string {
  if (process.env.XDG_DATA_HOME) return process.env.XDG_DATA_HOME;
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support");
  if (process.platform === "win32") return path.join(home, "AppData", "Roaming");
  return path.join(home, ".local", "share");
}

/** VS Code / Cursor 等编辑器的 globalStorage 目录候选 */
function editorGlobalStorage(home: string, product: string): string[] {
  if (process.platform === "darwin") return [path.join(home, "Library", "Application Support", product, "User", "globalStorage")];
  if (process.platform === "win32") return [path.join(home, "AppData", "Roaming", product, "User", "globalStorage")];
  return [path.join(home, ".config", product, "User", "globalStorage")];
}

function vscodeStorage(home: string, extensionId: string): string[] {
  const products = ["Code", "Code - Insiders", "VSCodium", "Cursor", "Windsurf"];
  const out: string[] = [];
  for (const product of products) {
    for (const base of editorGlobalStorage(home, product)) out.push(path.join(base, extensionId));
  }
  return out;
}

const JSONL = /\.(jsonl|ndjson)$/i;
const JSON = /\.json$/i;

/**
 * 全部 provider 定义。
 * 说明：标注 sqliteOnly 的工具官方读 SQLite，本实现不支持（扩展宿主没有 sqlite 驱动）。
 */
export const PROVIDERS: ProviderDef[] = [
  // ---- Claude Code 及其衍生（同格式） ----
  { id: "claude", name: "Claude", kind: "claude", roots: ["~/.claude/projects"], fileMatch: JSONL },
  { id: "openclaude", name: "OpenClaude", kind: "claude", roots: ["~/.openclaude/projects"], fileMatch: JSONL },
  { id: "codebuddy", name: "CodeBuddy", kind: "claude", roots: ["~/.codebuddy/projects"], fileMatch: JSONL },
  { id: "qwen", name: "Qwen Code", kind: "claude", roots: ["~/.qwen/projects"], fileMatch: JSONL },
  { id: "codewhale", name: "CodeWhale", kind: "claude", roots: ["~/.codewhale/sessions", "~/.deepseek/sessions"], fileMatch: JSONL },
  { id: "deepseek", name: "DeepSeek", kind: "claude", roots: ["~/.dsh/sessions"], fileMatch: JSONL },

  // ---- Codex 及其衍生 ----
  { id: "codex", name: "Codex", kind: "codex", roots: ["~/.codex/sessions", "~/.buzz/sessions"], fileMatch: JSONL },
  { id: "droid", name: "Droid", kind: "codex", roots: ["~/.factory/sessions"], fileMatch: JSONL },

  // ---- Cline 系（ui_messages.json） ----
  { id: "cline", name: "Cline", kind: "cline", roots: (home) => vscodeStorage(home, "saoudrizwan.claude-dev"), fileMatch: JSON },
  { id: "roo", name: "Roo Code", kind: "cline", roots: (home) => vscodeStorage(home, "rooveterinaryinc.roo-cline"), fileMatch: JSON },
  { id: "kilo", name: "Kilo Code", kind: "cline", roots: (home) => [path.join(dataHome(home), "kilo")], fileMatch: JSON },
  { id: "cline_cli", name: "Cline CLI", kind: "cline", roots: ["~/.cline/data/sessions"], fileMatch: JSON },

  // ---- Gemini 系 ----
  { id: "gemini", name: "Gemini", kind: "gemini", roots: ["~/.gemini/tmp"], fileMatch: JSON },

  // ---- 通用 JSON / JSONL ----
  { id: "amp", name: "Amp", kind: "generic", roots: ["~/.cache/amp/logs/threads"], fileMatch: JSONL },
  { id: "codebuff", name: "Codebuff", kind: "generic", roots: ["~/.config/manicode", "~/.config/manicode-dev"], fileMatch: JSONL },
  { id: "continue", name: "Continue", kind: "generic", roots: ["~/.continue/sessions"], fileMatch: JSON },
  { id: "copilot_cli", name: "Copilot CLI", kind: "generic", roots: ["~/.copilot/session-state"], fileMatch: /\.jsonl$/i },
  { id: "crush", name: "Crush", kind: "generic", roots: (home) => [path.join(dataHome(home), "crush")], fileMatch: JSONL },
  { id: "devin", name: "Devin", kind: "generic", roots: ["~/.local/share/devin/transcripts"], fileMatch: JSON },
  { id: "grok", name: "Grok Build", kind: "generic", roots: ["~/.grok/sessions"], fileMatch: /\.(jsonl|json)$/i },
  { id: "ibm_bob", name: "IBM Bob", kind: "generic", roots: ["~/AppData/Roaming/IBM Bob", "~/Library/Application Support/IBM Bob"], fileMatch: JSONL },
  { id: "kimi", name: "Kimi", kind: "generic", roots: ["~/.kimi/sessions"], fileMatch: JSONL },
  { id: "kimi_code", name: "Kimi Code", kind: "generic", roots: ["~/.kimi-code/sessions"], fileMatch: JSONL },
  { id: "kiro", name: "Kiro", kind: "generic", roots: ["~/.kiro/sessions"], fileMatch: JSON },
  { id: "lingtai", name: "LingTai TUI", kind: "generic", roots: ["~/.lingtai"], fileMatch: JSONL },
  { id: "mistral_vibe", name: "Mistral Vibe", kind: "generic", roots: ["~/.vibe/logs/session"], fileMatch: JSONL },
  { id: "mux", name: "Mux", kind: "generic", roots: ["~/.mux/sessions"], fileMatch: JSON },
  { id: "omp", name: "OMP", kind: "generic", roots: ["~/.omp/agent/sessions"], fileMatch: JSONL },
  { id: "open_design", name: "Open Design", kind: "generic", roots: ["~/AppData/Roaming/Open Design", "~/Library/Application Support/Open Design"], fileMatch: JSONL },
  { id: "openclaw", name: "OpenClaw", kind: "generic", roots: ["~/.openclaw/agents", "~/.clawdbot/agents", "~/.moldbot/agents"], fileMatch: /\.(jsonl|json)$/i },
  { id: "pi", name: "Pi", kind: "generic", roots: ["~/.pi/agent/sessions"], fileMatch: JSONL },
  { id: "quickdesk", name: "Quick Desktop", kind: "generic", roots: ["~/.quickwork"], fileMatch: JSONL },
  { id: "zerostack", name: "Zerostack", kind: "generic", roots: (home) => [path.join(dataHome(home), "zerostack", "sessions")], fileMatch: JSON },
  { id: "cursor_agent", name: "Cursor Agent", kind: "generic", roots: ["~/.cursor/projects"], fileMatch: JSON },
  { id: "forge", name: "Forge", kind: "generic", roots: ["~/.forge"], fileMatch: JSONL },
];

/** 官方支持但本实现读不了的（读 SQLite，扩展宿主无驱动） */
export const SQLITE_ONLY_PROVIDERS: { id: string; name: string; path: string }[] = [
  { id: "cursor", name: "Cursor", path: "state.vscdb" },
  { id: "copilot", name: "Copilot", path: "workspaceStorage/*/state.vscdb" },
  { id: "windsurf", name: "Windsurf", path: "state.vscdb" },
  { id: "cody", name: "Cody", path: "state.vscdb" },
  { id: "goose", name: "Goose", path: "sessions.db" },
  { id: "opencode", name: "OpenCode", path: "storage/session" },
  { id: "qoder", name: "Qoder", path: "local.db" },
  { id: "warp", name: "Warp", path: "warp.sqlite" },
  { id: "zed", name: "Zed", path: "threads.db" },
  { id: "zcode", name: "ZCode", path: "db.sqlite" },
  { id: "hermes", name: "Hermes", path: "state.db" },
  { id: "cursor_agent_db", name: "Cursor Agent DB", path: "ai-code-tracking.db" },
  { id: "antigravity", name: "Antigravity", path: "state.vscdb" },
  { id: "kiro_db", name: "Kiro DB", path: "sessions.db" },
  { id: "opencode_v2", name: "OpenCode v2", path: "opencode.db" },
  { id: "gemini_antigravity", name: "Gemini (Antigravity)", path: "product.json + state.vscdb" },
];

/** 把 ~ 展开成 home，并把 * 段展开为实际目录 */
export function expandRoot(home: string, root: string): string[] {
  const raw = root.startsWith("~") ? path.join(home, root.slice(1)) : root;
  if (!raw.includes("*")) return [raw];

  const parts = raw.split(/[\\/]/);
  let current = [parts[0] === "" ? path.sep : parts[0]];
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const next: string[] = [];
    for (const base of current) {
      if (part === "*") {
        try {
          for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
            if (entry.isDirectory()) next.push(path.join(base, entry.name));
          }
        } catch { /* 忽略 */ }
      } else {
        next.push(path.join(base, part));
      }
    }
    current = next;
  }
  return current;
}

export interface DiscoveredFile {
  provider: ProviderDef;
  file: string;
}

/** 遍历所有 provider，收集 transcript 文件 */
export function discoverTranscripts(home: string, maxDepth = 6): DiscoveredFile[] {
  const out: DiscoveredFile[] = [];

  const walk = (provider: ProviderDef, dir: string, depth: number): void => {
    if (depth > maxDepth) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(provider, full, depth + 1);
      else if (entry.isFile() && provider.fileMatch.test(entry.name)) out.push({ provider, file: full });
    }
  };

  for (const provider of PROVIDERS) {
    const roots = typeof provider.roots === "function" ? provider.roots(home) : provider.roots;
    for (const rootPattern of roots) {
      for (const dir of expandRoot(home, rootPattern)) {
        walk(provider, dir, 0);
      }
    }
  }
  return out;
}
