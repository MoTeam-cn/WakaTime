import type { Heartbeat, EntityType, Category } from "./types.ts";
import { normalizeLanguage } from "./language.ts";

const ENTITY_TYPES: EntityType[] = ["file", "app", "url", "domain"];

const VALID_CATEGORIES: Category[] = [
  "coding", "building", "indexing", "debugging", "browsing",
  "running tests", "writing tests", "manual testing", "writing docs",
  "code reviewing", "communicating", "notes", "researching",
  "learning", "designing", "ai coding",
];

/** 缺省分类按实体类型推断 */
export function defaultCategory(type: EntityType): Category {
  switch (type) {
    case "app":
      return "coding";
    case "url":
    case "domain":
      return "browsing";
    default:
      return "coding";
  }
}

export class HeartbeatError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = "HeartbeatError";
    this.field = field;
  }
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v === "true" || v === "1";
  return false;
}

/** 反斜杠统一为正斜杠，去掉首尾空白 */
export function normalizeEntity(entity: string): string {
  return entity.trim().replace(/\\/g, "/");
}

/** 依赖数组转逗号串（去重、排序、保留原顺序） */
export function normalizeDependencies(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  let list: string[] = [];
  if (Array.isArray(v)) {
    list = v.map((x) => String(x).trim()).filter((x) => x.length > 0);
  } else if (typeof v === "string") {
    list = v.split(",").map((x) => x.trim()).filter((x) => x.length > 0);
  } else {
    return null;
  }
  if (list.length === 0) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of list) {
    const key = d.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out.join(",");
}

/** 从 User-Agent 解析编辑器与操作系统，形如 vscode/1.90.0 vscode-wakatime/30.2.1 */
export function parseUserAgent(ua: string | null): { editor: string | null; os: string | null } {
  if (!ua) return { editor: null, os: null };
  const lower = ua.toLowerCase();
  let editor: string | null = null;
  const knownEditors = [
    "vscode", "cursor", "windsurf", "vim", "neovim", "emacs", "sublime",
    "atom", "intellij", "pycharm", "webstorm", "goland", "clion", "rider",
    "phpstorm", "rubymine", "android-studio", "xcode", "eclipse", "zed",
  ];
  for (const e of knownEditors) {
    if (lower.includes(e)) { editor = e; break; }
  }
  let os: string | null = null;
  if (lower.includes("windows") || lower.includes("win32")) os = "windows";
  else if (lower.includes("darwin") || lower.includes("macos") || lower.includes("mac os")) os = "mac";
  else if (lower.includes("linux")) os = "linux";
  return { editor, os };
}

/**
 * 把客户端上报的原始 JSON 规范化为内部 Heartbeat。
 * 同时接受 snake_case 与 camelCase 键名（官方插件用 snake_case）。
 * 校验失败抛 HeartbeatError。
 */
export function normalizeHeartbeat(raw: unknown, userAgentHeader?: string | null): Heartbeat {
  if (typeof raw !== "object" || raw === null) {
    throw new HeartbeatError("heartbeat", "心跳必须是对象");
  }
  const o = raw as Record<string, unknown>;

  const rawEntity = str(o.entity) ?? str(o.file) ?? str(o.local_file);
  if (!rawEntity) throw new HeartbeatError("entity", "缺少 entity");
  const entity = normalizeEntity(rawEntity);
  if (entity.length > 4096) throw new HeartbeatError("entity", "entity 过长");

  const time = num(o.time);
  if (time === null) throw new HeartbeatError("time", "缺少 time");
  if (time < 0 || time > 4e9) throw new HeartbeatError("time", "time 超出合理范围");

  const rawType = str(o.type) ?? str(o.entity_type) ?? "file";
  const type: EntityType = (ENTITY_TYPES as string[]).includes(rawType)
    ? (rawType as EntityType)
    : "file";

  const rawCategory = str(o.category);
  const category: Category =
    rawCategory && (VALID_CATEGORIES as string[]).includes(rawCategory)
      ? (rawCategory as Category)
      : defaultCategory(type);

  const ua = str(o.user_agent) ?? userAgentHeader ?? null;
  const parsedUa = parseUserAgent(ua);

  return {
    entity,
    type,
    category,
    time,
    project: str(o.project),
    projectRootCount: num(o.project_root_count),
    branch: str(o.branch),
    language: normalizeLanguage(str(o.language)),
    dependencies: normalizeDependencies(o.dependencies),
    lines: num(o.lines),
    lineno: num(o.lineno),
    cursorpos: num(o.cursorpos),
    isWrite: bool(o.is_write ?? o.isWrite),
    machineNameId: str(o.machine_name_id ?? o.machineNameId),
    userAgent: ua,
    editor: str(o.editor) ?? parsedUa.editor,
    os: str(o.os) ?? parsedUa.os,
    aiLineChanges: num(o.ai_line_changes),
    humanLineChanges: num(o.human_line_changes),
    aiSession: str(o.ai_session),
    aiInputTokens: num(o.ai_input_tokens),
    aiOutputTokens: num(o.ai_output_tokens),
    aiPromptLength: num(o.ai_prompt_length),
    aiSubscriptionPlan: str(o.ai_subscription_plan),
  };
}

/** 去重键：同用户 + 同实体 + 同时间视为重复心跳 */
export function dedupKey(userId: string, entity: string, time: number): string {
  return userId + "|" + entity + "|" + time.toFixed(3);
}

