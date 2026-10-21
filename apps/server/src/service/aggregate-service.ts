import type { Db } from "../store/db.ts";
import { aggregate, mergeDurations, localDay } from "@waka/core";
import type { Duration } from "@waka/core";
import { listHeartbeatsBetween } from "../store/heartbeats.ts";
import { deleteAllDurations, deleteDurationsFrom, insertDurations } from "../store/durations.ts";

export interface AggregateConfig {
  timezone: string;
  timeout: number;
  maxGap: number;
}

/**
 * 从 fromTime 起重算该用户的时长缓存。
 * 做法：取 fromTime - timeout 之后的所有心跳重算，先删掉与新结果重叠的旧行再插入。
 */
export function recomputeFrom(db: Db, userId: string, fromTime: number, cfg: AggregateConfig): number {
  const since = Math.max(0, fromTime - cfg.timeout);
  const heartbeats = listHeartbeatsBetween(db, userId, since, Number.MAX_SAFE_INTEGER);
  if (heartbeats.length === 0) {
    deleteDurationsFrom(db, userId, fromTime);
    return 0;
  }
  const durations = aggregate(heartbeats, {
    timezone: cfg.timezone,
    timeout: cfg.timeout,
    maxGap: cfg.maxGap,
  });
  if (durations.length === 0) {
    deleteDurationsFrom(db, userId, fromTime);
    return 0;
  }
  const firstStart = Math.min(durations[0].startTime, fromTime);
  deleteDurationsFrom(db, userId, firstStart);
  insertDurations(db, userId, durations);
  return durations.length;
}

/** 全量重算（迁移或修复用） */
export function recomputeAll(db: Db, userId: string, cfg: AggregateConfig): number {
  const heartbeats = listHeartbeatsBetween(db, userId, 0, Number.MAX_SAFE_INTEGER);
  deleteAllDurations(db, userId);
  if (heartbeats.length === 0) return 0;
  const durations = aggregate(heartbeats, { timezone: cfg.timezone, timeout: cfg.timeout, maxGap: cfg.maxGap });
  insertDurations(db, userId, durations);
  return durations.length;
}

/** 取某天（用户时区）的时长 */
export function durationsForDay(db: Db, userId: string, day: string): Duration[] {
  const rows = db
    .prepare("SELECT * FROM durations WHERE user_id = ? AND day = ? ORDER BY start_time ASC")
    .all(userId, day) as Record<string, unknown>[];
  return rows.map((row) => ({
    startTime: Number(row.start_time),
    endTime: Number(row.end_time),
    duration: Number(row.duration),
    project: row.project === null ? null : String(row.project),
    branch: row.branch === null ? null : String(row.branch),
    language: row.language === null ? null : String(row.language),
    category: String(row.category ?? "coding") as Duration["category"],
    entity: String(row.entity ?? ""),
    isWrite: Number(row.is_write) !== 0,
    numHeartbeats: Number(row.num_heartbeats),
    machineNameId: row.machine_name_id === null ? null : String(row.machine_name_id),
    editor: row.editor === null ? null : String(row.editor),
    os: row.os === null ? null : String(row.os),
    day: String(row.day),
  }));
}

export function todayInTz(timezone: string): string {
  return localDay(Math.floor(Date.now() / 1000), timezone);
}

/** 生成 [startDay, endDay] 之间的日期序列 */
export function dayRange(startDay: string, endDay: string): string[] {
  const out: string[] = [];
  const start = new Date(startDay + "T00:00:00Z").getTime();
  const end = new Date(endDay + "T00:00:00Z").getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return out;
  const dayMs = 86400000;
  for (let t = start; t <= end; t += dayMs) {
    out.push(new Date(t).toISOString().slice(0, 10));
    if (out.length > 400) break;
  }
  return out;
}

export { mergeDurations };

