import type { Db } from "./db.ts";
import { newId } from "./db.ts";
import type { Duration } from "@waka/core";

function mapDuration(row: Record<string, unknown>): Duration {
  const s = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
  return {
    startTime: Number(row.start_time),
    endTime: Number(row.end_time),
    duration: Number(row.duration),
    project: s(row.project),
    branch: s(row.branch),
    language: s(row.language),
    category: String(row.category ?? "coding") as Duration["category"],
    entity: String(row.entity ?? ""),
    isWrite: Number(row.is_write) !== 0,
    numHeartbeats: Number(row.num_heartbeats),
    machineNameId: s(row.machine_name_id),
    editor: s(row.editor),
    os: s(row.os),
    day: String(row.day),
  };
}

export function insertDurations(db: Db, userId: string, list: Duration[]): void {
  if (list.length === 0) return;
  const stmt = db.prepare(
    "INSERT INTO durations(id, user_id, start_time, end_time, duration, project, branch, language, category, entity, is_write, num_heartbeats, machine_name_id, editor, os, day) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
  );
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const d of list) {
      stmt.run(
        newId(),
        userId,
        d.startTime,
        d.endTime,
        d.duration,
        d.project,
        d.branch,
        d.language,
        d.category,
        d.entity,
        d.isWrite ? 1 : 0,
        d.numHeartbeats,
        d.machineNameId,
        d.editor,
        d.os,
        d.day
      );
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function deleteDurationsFrom(db: Db, userId: string, fromTime: number): void {
  db.prepare("DELETE FROM durations WHERE user_id = ? AND start_time >= ?").run(userId, fromTime);
}

export function deleteAllDurations(db: Db, userId: string): void {
  db.prepare("DELETE FROM durations WHERE user_id = ?").run(userId);
}

export function listDurationsByDay(db: Db, userId: string, day: string): Duration[] {
  const rows = db
    .prepare("SELECT * FROM durations WHERE user_id = ? AND day = ? ORDER BY start_time ASC")
    .all(userId, day) as Record<string, unknown>[];
  return rows.map(mapDuration);
}

export function listDurationsBetween(db: Db, userId: string, fromDay: string, toDay: string): Duration[] {
  const rows = db
    .prepare("SELECT * FROM durations WHERE user_id = ? AND day >= ? AND day <= ? ORDER BY start_time ASC")
    .all(userId, fromDay, toDay) as Record<string, unknown>[];
  return rows.map(mapDuration);
}

export function listAllDurations(db: Db, userId: string): Duration[] {
  const rows = db.prepare("SELECT * FROM durations WHERE user_id = ? ORDER BY start_time ASC").all(userId) as Record<
    string,
    unknown
  >[];
  return rows.map(mapDuration);
}

export function minDurationDay(db: Db, userId: string): string | null {
  const row = db.prepare("SELECT MIN(day) AS d FROM durations WHERE user_id = ?").get(userId) as { d: string | null };
  return row.d ?? null;
}

