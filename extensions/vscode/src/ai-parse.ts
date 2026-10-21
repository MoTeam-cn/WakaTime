import path from "node:path";

/** 通用提取出的原始事件 */
export interface RawEvent {
  entity: string;
  time: number;
  lineChanges: number;
  isWrite: boolean;
  project: string | null;
}

const PATH_KEYS = [
  "file_path", "filePath", "filepath", "file_name", "fileName", "filename",
  "target_file", "targetFile", "absolutePath", "absolute_path", "absPath",
  "notebook_path", "notebookPath", "uri", "path", "file",
];

const WRITE_KEYS = [
  "new_string", "newString", "new_content", "newContent", "newText", "new_text",
  "modifiedContent", "modified_content", "replacement", "content", "code", "diff", "patch", "text",
];

const OLD_KEYS = ["old_string", "oldString", "originalContent", "original_content", "oldText", "old_text", "original"];

const TIME_KEYS = ["timestamp", "time", "ts", "created_at", "createdAt", "date", "updatedAt", "updated_at"];

const CWD_KEYS = ["cwd", "workingDirectory", "working_directory", "projectPath", "projectRoot", "root"];

function looksLikePath(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (v.length === 0 || v.length > 500) return false;
  if (/^https?:\/\//i.test(v)) return false;
  if (v.includes("\n") || v.includes("\r")) return false;
  return /[\\/]/.test(v) || /\.[A-Za-z0-9]{1,10}$/.test(v);
}

export function toEpochSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1e12) return value / 1000;
    if (value > 1e9) return value;
    return null;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return ms / 1000;
    const num = Number(value);
    if (Number.isFinite(num) && num > 1e9) return num > 1e12 ? num / 1000 : num;
  }
  return null;
}

export function countLines(text: string): number {
  if (text.length === 0) return 0;
  const normalized = text.endsWith("\n") ? text.slice(0, -1) : text;
  return normalized.split("\n").length;
}

/** 统一 diff 的 +/- 行数差 */
function diffLineDelta(diff: string): number {
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) continue;
    if (line.startsWith("+")) added++;
    else if (line.startsWith("-")) removed++;
  }
  return added - removed;
}

function firstString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function resolveEntity(raw: string, cwd: string | null): string | null {
  const value = raw.trim();
  if (value.length === 0) return null;
  if (/^file:\/\//i.test(value)) {
    try { return decodeURIComponent(value.replace(/^file:\/\//i, "")); } catch { return null; }
  }
  if (path.isAbsolute(value)) return value;
  if (cwd) return path.join(cwd, value);
  return value.includes("/") || value.includes("\\") ? value : null;
}

const MAX_NESTED_PARSE = 200_000;

/**
 * 递归遍历任意 JSON，挑出「文件路径 + 写入内容」的组合。
 * 同时展开嵌套的 JSON 字符串（Cline / Gemini 把工具调用塞在 text 里）。
 */
export function extractEvents(
  node: unknown,
  ctx: { time: number | null; cwd: string | null } = { time: null, cwd: null },
  out: RawEvent[] = [],
  depth = 0
): RawEvent[] {
  if (depth > 10 || node === null || node === undefined) return out;

  if (Array.isArray(node)) {
    for (const item of node) extractEvents(item, ctx, out, depth + 1);
    return out;
  }

  if (typeof node !== "object") return out;

  const obj = node as Record<string, unknown>;

  let time = ctx.time;
  for (const key of TIME_KEYS) {
    const parsed = toEpochSeconds(obj[key]);
    if (parsed !== null) { time = parsed; break; }
  }

  let cwd = ctx.cwd;
  const cwdValue = firstString(obj, CWD_KEYS);
  if (cwdValue && path.isAbsolute(cwdValue)) cwd = cwdValue;

  const rawPath = firstString(obj, PATH_KEYS);
  const writeValue = firstString(obj, WRITE_KEYS);

  if (rawPath && writeValue && looksLikePath(rawPath)) {
    const entity = resolveEntity(rawPath, cwd);
    if (entity) {
      const oldValue = firstString(obj, OLD_KEYS);
      let lineChanges: number;
      if (oldValue !== null && writeValue !== oldValue) {
        lineChanges = countLines(writeValue) - countLines(oldValue);
      } else if (/^(diff --git|@@ |--- |\+\+\+ )/.test(writeValue) || writeValue.includes("\n@@ ")) {
        lineChanges = diffLineDelta(writeValue);
      } else {
        lineChanges = countLines(writeValue);
      }
      if (lineChanges > 0 && time !== null) {
        out.push({
          entity,
          time,
          lineChanges,
          isWrite: true,
          project: cwd ? path.basename(cwd) : path.basename(path.dirname(entity)),
        });
      }
    }
  }

  const nextCtx = { time, cwd };
  for (const value of Object.values(obj)) {
    if (typeof value === "string") {
      const trimmed = value.trimStart();
      if (trimmed.length > 1 && trimmed.length < MAX_NESTED_PARSE && (trimmed.startsWith("{") || trimmed.startsWith("["))) {
        try {
          extractEvents(JSON.parse(value), nextCtx, out, depth + 1);
        } catch { /* 不是 JSON，忽略 */ }
      }
      continue;
    }
    extractEvents(value, nextCtx, out, depth + 1);
  }

  return out;
}

/** 同一文件同一秒只保留一条，行数取最大 */
export function dedupeEvents(events: RawEvent[]): RawEvent[] {
  const map = new Map<string, RawEvent>();
  for (const event of events) {
    const key = event.entity + "|" + Math.floor(event.time);
    const existing = map.get(key);
    if (existing) {
      if (event.lineChanges > existing.lineChanges) existing.lineChanges = event.lineChanges;
    } else {
      map.set(key, { ...event });
    }
  }
  return [...map.values()];
}
