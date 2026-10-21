import type { Db } from "./db.ts";
import { newId, nowSeconds } from "./db.ts";
import type { Heartbeat } from "@waka/core";

export interface HeartbeatRow extends Heartbeat {
  id: string;
  userId: string;
}

function mapHb(row: Record<string, unknown>): HeartbeatRow {
  const nullableStr = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
  const nullableNum = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
  return {
    id: String(row.id),
    userId: String(row.user_id),
    entity: String(row.entity),
    type: String(row.type) as Heartbeat["type"],
    category: String(row.category ?? "coding") as Heartbeat["category"],
    time: Number(row.time),
    project: nullableStr(row.project),
    projectRootCount: nullableNum(row.project_root_count),
    branch: nullableStr(row.branch),
    language: nullableStr(row.language),
    dependencies: nullableStr(row.dependencies),
    lines: nullableNum(row.lines),
    lineno: nullableNum(row.lineno),
    cursorpos: nullableNum(row.cursorpos),
    isWrite: Number(row.is_write) !== 0,
    machineNameId: nullableStr(row.machine_name_id),
    userAgent: nullableStr(row.user_agent),
    editor: nullableStr(row.editor),
    os: nullableStr(row.os),
    aiLineChanges: nullableNum(row.ai_line_changes),
    humanLineChanges: nullableNum(row.human_line_changes),
    aiSession: nullableStr(row.ai_session),
    aiInputTokens: nullableNum(row.ai_input_tokens),
    aiOutputTokens: nullableNum(row.ai_output_tokens),
    aiPromptLength: nullableNum(row.ai_prompt_length),
    aiSubscriptionPlan: nullableStr(row.ai_subscription_plan),
  };
}

/** 批量插入，重复心跳（同 user + entity + time）静默忽略。返回实际插入条数。 */
export function insertHeartbeats(db: Db, userId: string, list: Heartbeat[]): number {
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO heartbeats(id, user_id, entity, type, category, time, project, project_root_count, branch, language, dependencies, lines, lineno, cursorpos, is_write, machine_name_id, user_agent, editor, os, ai_line_changes, human_line_changes, ai_session, ai_input_tokens, ai_output_tokens, ai_prompt_length, ai_subscription_plan, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
  );
  const now = nowSeconds();
  let inserted = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const h of list) {
      const res = stmt.run(
        newId(),
        userId,
        h.entity,
        h.type,
        h.category,
        h.time,
        h.project,
        h.projectRootCount,
        h.branch,
        h.language,
        h.dependencies,
        h.lines,
        h.lineno,
        h.cursorpos,
        h.isWrite ? 1 : 0,
        h.machineNameId,
        h.userAgent,
        h.editor,
        h.os,
        h.aiLineChanges,
        h.humanLineChanges,
        h.aiSession,
        h.aiInputTokens,
        h.aiOutputTokens,
        h.aiPromptLength,
        h.aiSubscriptionPlan,
        now
      );
      inserted += Number(res.changes ?? 0);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return inserted;
}

export function listHeartbeatsBetween(db: Db, userId: string, from: number, to: number): Heartbeat[] {
  const rows = db
    .prepare("SELECT * FROM heartbeats WHERE user_id = ? AND time >= ? AND time <= ? ORDER BY time ASC")
    .all(userId, from, to) as Record<string, unknown>[];
  return rows.map(mapHb);
}

export function latestHeartbeatTime(db: Db, userId: string): number | null {
  const row = db.prepare("SELECT MAX(time) AS t FROM heartbeats WHERE user_id = ?").get(userId) as {
    t: number | null;
  };
  return row.t === null || row.t === undefined ? null : Number(row.t);
}

export function earliestHeartbeatTime(db: Db, userId: string): number | null {
  const row = db.prepare("SELECT MIN(time) AS t FROM heartbeats WHERE user_id = ?").get(userId) as {
    t: number | null;
  };
  return row.t === null || row.t === undefined ? null : Number(row.t);
}

export function countHeartbeats(db: Db, userId: string): number {
  const row = db.prepare("SELECT COUNT(*) AS c FROM heartbeats WHERE user_id = ?").get(userId) as { c: number };
  return Number(row.c);
}

export function distinctProjects(db: Db, userId: string): string[] {
  const rows = db
    .prepare("SELECT DISTINCT project FROM heartbeats WHERE user_id = ? AND project IS NOT NULL ORDER BY project")
    .all(userId) as { project: string }[];
  return rows.map((r) => r.project);
}

export function distinctMachines(db: Db, userId: string): { id: string; lastSeen: number }[] {
  const rows = db
    .prepare(
      "SELECT machine_name_id AS id, MAX(time) AS last_seen FROM heartbeats WHERE user_id = ? AND machine_name_id IS NOT NULL GROUP BY machine_name_id ORDER BY last_seen DESC"
    )
    .all(userId) as { id: string; last_seen: number }[];
  return rows.map((r) => ({ id: r.id, lastSeen: Number(r.last_seen) }));
}

export function distinctUserAgents(db: Db, userId: string): { ua: string; lastSeen: number }[] {
  const rows = db
    .prepare(
      "SELECT user_agent AS ua, MAX(time) AS last_seen FROM heartbeats WHERE user_id = ? AND user_agent IS NOT NULL GROUP BY user_agent ORDER BY last_seen DESC LIMIT 50"
    )
    .all(userId) as { ua: string; last_seen: number }[];
  return rows.map((r) => ({ ua: r.ua, lastSeen: Number(r.last_seen) }));
}

