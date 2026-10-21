import type { Db } from "./db.ts";
import { newId, nowSeconds } from "./db.ts";

export interface AuditEntry {
  id: string;
  userId: string | null;
  action: string;
  target: string | null;
  ip: string | null;
  userAgent: string | null;
  meta: string | null;
  createdAt: number;
}

export function logAudit(
  db: Db,
  input: {
    userId: string | null;
    action: string;
    target?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    meta?: Record<string, unknown> | null;
  }
): void {
  db.prepare("INSERT INTO audit_logs(id, user_id, action, target, ip, user_agent, meta, created_at) VALUES(?,?,?,?,?,?,?,?)").run(
    newId(),
    input.userId,
    input.action,
    input.target ?? null,
    input.ip ?? null,
    input.userAgent ?? null,
    input.meta ? JSON.stringify(input.meta) : null,
    nowSeconds()
  );
}

export function listAudit(
  db: Db,
  filter: { action?: string; userId?: string; from?: number; to?: number },
  page: number,
  perPage: number
): { entries: AuditEntry[]; total: number } {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (filter.action) {
    where.push("action = ?");
    args.push(filter.action);
  }
  if (filter.userId) {
    where.push("user_id = ?");
    args.push(filter.userId);
  }
  if (filter.from) {
    where.push("created_at >= ?");
    args.push(filter.from);
  }
  if (filter.to) {
    where.push("created_at <= ?");
    args.push(filter.to);
  }
  const clause = where.length > 0 ? " WHERE " + where.join(" AND ") : "";
  const totalRow = db.prepare("SELECT COUNT(*) AS c FROM audit_logs" + clause).get(...args) as { c: number };
  const rows = db
    .prepare("SELECT * FROM audit_logs" + clause + " ORDER BY created_at DESC LIMIT ? OFFSET ?")
    .all(...args, perPage, Math.max(0, (page - 1) * perPage)) as Record<string, unknown>[];
  return {
    total: Number(totalRow.c),
    entries: rows.map((r) => ({
      id: String(r.id),
      userId: r.user_id === null || r.user_id === undefined ? null : String(r.user_id),
      action: String(r.action),
      target: r.target === null || r.target === undefined ? null : String(r.target),
      ip: r.ip === null || r.ip === undefined ? null : String(r.ip),
      userAgent: r.user_agent === null || r.user_agent === undefined ? null : String(r.user_agent),
      meta: r.meta === null || r.meta === undefined ? null : String(r.meta),
      createdAt: Number(r.created_at),
    })),
  };
}

export function deleteAuditOlderThan(db: Db, ts: number): number {
  const res = db.prepare("DELETE FROM audit_logs WHERE created_at < ?").run(ts);
  return Number(res.changes ?? 0);
}

