import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** 从 AI 工具会话日志里解析出的编码活动 */
export interface TranscriptHeartbeat {
  tool: string;
  entity: string;
  time: number;
  isWrite: boolean;
  lineChanges: number;
  project: string | null;
  sessionId: string;
}

/** 每个 transcript 文件已消费的字节偏移 */
export type TranscriptState = Record<string, number>;

export interface SyncResult {
  heartbeats: TranscriptHeartbeat[];
  filesTouched: number;
  newState: TranscriptState;
}

const MAX_READ_BYTES = 8 * 1024 * 1024;

/** Claude Code 的 sub-agent 临时产物，不算用户代码 */
const CLAUDE_TASK_OUTPUT = /(?:^|\/)claude-\d+\/(?:[^/]+\/)+tasks\/[^/]+\.output$/;

function toSlash(p: string): string {
  return p.replace(/\\/g, "/");
}

function countLines(text: string): number {
  if (text.length === 0) return 0;
  const normalized = text.endsWith("\n") ? text.slice(0, -1) : text;
  return normalized.split("\n").length;
}

function walk(dir: string, filter: (file: string) => boolean, out: string[], depth = 0): void {
  if (depth > 6) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, filter, out, depth + 1);
    } else if (entry.isFile() && filter(full)) {
      out.push(full);
    }
  }
}

/** 从 offset 起读取新增内容，返回完整行与新的 offset */
function readNewLines(file: string, offset: number): { lines: string[]; nextOffset: number } {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    return { lines: [], nextOffset: offset };
  }
  if (stat.size <= offset) return { lines: [], nextOffset: offset };
  if (stat.size - offset > MAX_READ_BYTES) offset = stat.size - MAX_READ_BYTES;

  let fd: number | null = null;
  try {
    fd = fs.openSync(file, "r");
    const length = stat.size - offset;
    const buffer = Buffer.alloc(length);
    const read = fs.readSync(fd, buffer, 0, length, offset);
    const text = buffer.subarray(0, read).toString("utf8");
    const lastNewline = text.lastIndexOf("\n");
    if (lastNewline < 0) return { lines: [], nextOffset: offset };
    const complete = text.slice(0, lastNewline);
    const consumedBytes = Buffer.byteLength(text.slice(0, lastNewline + 1), "utf8");
    return {
      lines: complete.split("\n").filter((l) => l.trim().length > 0),
      nextOffset: offset + consumedBytes,
    };
  } catch {
    return { lines: [], nextOffset: offset };
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch { /* 忽略 */ }
    }
  }
}

// ---------- Claude Code ----------

interface ClaudeToolResult {
  type?: string;
  filePath?: string;
  file?: { filePath?: string };
  content?: unknown;
  originalFile?: string;
  oldString?: string;
  newString?: string;
  structuredPatch?: { newLines?: number; oldLines?: number }[];
}

function contentLineChanges(content: unknown): number {
  if (typeof content === "string") return countLines(content);
  if (Array.isArray(content)) {
    let total = 0;
    for (const item of content) {
      if (typeof item === "string") total += countLines(item);
      else if (item && typeof item === "object" && typeof (item as { text?: string }).text === "string") {
        total += countLines((item as { text: string }).text);
      }
    }
    return total;
  }
  return 0;
}

function claudeFilePath(result: ClaudeToolResult): string {
  if (result.filePath) return result.filePath;
  if (result.file?.filePath) return result.file.filePath;
  return "";
}

function claudeIsWrite(result: ClaudeToolResult): boolean {
  if (result.structuredPatch && result.structuredPatch.length > 0) return true;
  if (result.type === "create" || result.type === "update" || result.type === "delete") return true;
  if (result.newString !== undefined || result.oldString !== undefined) return true;
  if (result.originalFile !== undefined && result.originalFile !== "") return false;
  return contentLineChanges(result.content) !== 0;
}

function claudeLineChanges(result: ClaudeToolResult): number {
  if (result.structuredPatch && result.structuredPatch.length > 0) {
    let total = 0;
    for (const patch of result.structuredPatch) {
      total += (patch.newLines ?? 0) - (patch.oldLines ?? 0);
    }
    return total;
  }
  if (result.newString !== undefined) {
    const added = countLines(result.newString);
    if (result.oldString !== undefined) return added - countLines(result.oldString);
    return added;
  }
  if (result.originalFile !== undefined && result.originalFile !== "") return 0;
  return contentLineChanges(result.content);
}

interface ClaudeLine {
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  toolUseResult?: ClaudeToolResult | string | unknown[];
}

function parseClaudeLine(line: string): TranscriptHeartbeat | null {
  let obj: ClaudeLine;
  try {
    obj = JSON.parse(line) as ClaudeLine;
  } catch {
    return null;
  }
  const raw = obj.toolUseResult;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const result = raw as ClaudeToolResult;
  const filePath = claudeFilePath(result);
  if (filePath === "" || CLAUDE_TASK_OUTPUT.test(toSlash(filePath))) return null;
  if (!claudeIsWrite(result)) return null;

  const time = obj.timestamp ? Date.parse(obj.timestamp) / 1000 : Date.now() / 1000;
  if (!Number.isFinite(time)) return null;

  return {
    tool: "Claude",
    entity: filePath,
    time,
    isWrite: true,
    lineChanges: Math.max(0, claudeLineChanges(result)),
    project: obj.cwd ? path.basename(obj.cwd) : path.basename(path.dirname(filePath)),
    sessionId: obj.sessionId ?? path.basename(path.dirname(filePath)),
  };
}

export function claudeTranscriptPaths(home: string): string[] {
  const out: string[] = [];
  walk(path.join(home, ".claude", "projects"), (f) => f.endsWith(".jsonl"), out);
  return out;
}

export function syncClaude(home: string, state: TranscriptState): SyncResult {
  const files = claudeTranscriptPaths(home);
  const heartbeats: TranscriptHeartbeat[] = [];
  const newState: TranscriptState = {};
  let touched = 0;

  for (const file of files) {
    const key = "claude:" + toSlash(file);
    const { lines, nextOffset } = readNewLines(file, state[key] ?? 0);
    newState[key] = nextOffset;
    if (lines.length > 0) touched++;
    for (const line of lines) {
      const hb = parseClaudeLine(line);
      if (hb) heartbeats.push(hb);
    }
  }
  return { heartbeats, filesTouched: touched, newState };
}

// ---------- Codex ----------

interface CodexLine {
  timestamp?: string;
  type?: string;
  payload?: { type?: string; name?: string; input?: string; cwd?: string; arguments?: string };
}

function codexPatchFiles(input: string): { file: string; added: number; removed: number }[] {
  const out: { file: string; added: number; removed: number }[] = [];
  let current: { file: string; added: number; removed: number } | null = null;
  for (const raw of input.split("\n")) {
    const header = /^\*\*\* (?:Update|Add|Delete) File: (.+)$/.exec(raw.trim());
    if (header) {
      if (current) out.push(current);
      current = { file: header[1].trim(), added: 0, removed: 0 };
      continue;
    }
    if (!current) continue;
    if (raw.startsWith("+") && !raw.startsWith("+++")) current.added++;
    else if (raw.startsWith("-") && !raw.startsWith("---")) current.removed++;
  }
  if (current) out.push(current);
  return out;
}

function parseCodexLine(line: string): TranscriptHeartbeat[] {
  let obj: CodexLine;
  try {
    obj = JSON.parse(line) as CodexLine;
  } catch {
    return [];
  }
  const payload = obj.payload;
  if (!payload) return [];
  const input = payload.input ?? payload.arguments ?? "";
  if (!input.includes("*** Begin Patch") && !input.includes("*** Update File:")) return [];

  const time = obj.timestamp ? Date.parse(obj.timestamp) / 1000 : Date.now() / 1000;
  if (!Number.isFinite(time)) return [];

  const cwd = payload.cwd ?? "";
  const result: TranscriptHeartbeat[] = [];
  for (const entry of codexPatchFiles(input)) {
    const entity = path.isAbsolute(entry.file) ? entry.file : cwd ? path.join(cwd, entry.file) : entry.file;
    result.push({
      tool: "Codex",
      entity,
      time,
      isWrite: true,
      lineChanges: Math.max(0, entry.added - entry.removed),
      project: cwd ? path.basename(cwd) : path.basename(path.dirname(entity)),
      sessionId: cwd || "codex",
    });
  }
  return result;
}

export function codexTranscriptPaths(home: string): string[] {
  const out: string[] = [];
  walk(path.join(home, ".codex", "sessions"), (f) => f.endsWith(".jsonl"), out);
  return out;
}

export function syncCodex(home: string, state: TranscriptState): SyncResult {
  const files = codexTranscriptPaths(home);
  const heartbeats: TranscriptHeartbeat[] = [];
  const newState: TranscriptState = {};
  let touched = 0;

  for (const file of files) {
    const key = "codex:" + toSlash(file);
    const { lines, nextOffset } = readNewLines(file, state[key] ?? 0);
    newState[key] = nextOffset;
    if (lines.length > 0) touched++;
    for (const line of lines) {
      heartbeats.push(...parseCodexLine(line));
    }
  }
  return { heartbeats, filesTouched: touched, newState };
}

// ---------- 汇总 ----------

export interface AISyncOptions {
  home?: string;
  excludePatterns?: RegExp[];
}

export function syncAllTranscripts(state: TranscriptState, options: AISyncOptions = {}): SyncResult {
  const home = options.home ?? os.homedir();
  const claude = syncClaude(home, state);
  const codex = syncCodex(home, state);

  const excludes = options.excludePatterns ?? [];
  const heartbeats = [...claude.heartbeats, ...codex.heartbeats].filter((hb) => {
    const normalized = toSlash(hb.entity);
    return !excludes.some((re) => re.test(normalized));
  });

  return {
    heartbeats,
    filesTouched: claude.filesTouched + codex.filesTouched,
    newState: { ...claude.newState, ...codex.newState },
  };
}

/** 支持的 AI 工具（未列出的官方工具暂未实现） */
export const SUPPORTED_AI_TOOLS = ["Claude", "Codex"] as const;
