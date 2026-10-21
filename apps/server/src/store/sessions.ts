import type { Db } from "./db.ts";
import { newId, nowSeconds } from "./db.ts";

export interface SessionRow {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
  revokedAt: number | null;
}

function mapSession(row: Record<string, unknown>): SessionRow {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    tokenHash: String(row.token_hash),
    createdAt: Number(row.created_at),
    lastUsedAt: Number(row.last_used_at),
    expiresAt: Number(row.expires_at),
    revokedAt: row.revoked_at === null || row.revoked_at === undefined ? null : Number(row.revoked_at),
  };
}

export function createSession(
  db: Db,
  input: { userId: string; tokenHash: string; expiresAt: number; userAgent: string | null; ip: string | null }
): string {
  const id = newId();
  const now = nowSeconds();
  db.prepare(
    "INSERT INTO sessions(id, user_id, token_hash, created_at, last_used_at, expires_at, revoked_at, user_agent, ip) VALUES(?,?,?,?,?,?,NULL,?,?)"
  ).run(id, input.userId, input.tokenHash, now, now, input.expiresAt, input.userAgent, input.ip);
  return id;
}

export function findSessionByHash(db: Db, tokenHash: string): SessionRow | null {
  const row = db.prepare("SELECT * FROM sessions WHERE token_hash = ?").get(tokenHash) as
    | Record<string, unknown>
    | undefined;
  return row ? mapSession(row) : null;
}

export function touchSession(db: Db, id: string): void {
  db.prepare("UPDATE sessions SET last_used_at = ? WHERE id = ?").run(nowSeconds(), id);
}

export function revokeSession(db: Db, id: string): void {
  db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(nowSeconds(), id);
}

export function revokeAllForUser(db: Db, userId: string): void {
  db.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(nowSeconds(), userId);
}

export function deleteExpiredSessions(db: Db): number {
  const res = db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(nowSeconds());
  return Number(res.changes ?? 0);
}

