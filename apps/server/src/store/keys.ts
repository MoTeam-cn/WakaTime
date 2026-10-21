import type { Db } from "./db.ts";
import { newId, nowSeconds } from "./db.ts";

export interface ApiKeyRow {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
}

export interface ApiKeyWithUser extends ApiKeyRow {
  role: string;
  timezone: string;
  disabled: boolean;
}

function mapKey(row: Record<string, unknown>): ApiKeyRow {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    prefix: String(row.prefix),
    createdAt: Number(row.created_at),
    lastUsedAt: row.last_used_at === null || row.last_used_at === undefined ? null : Number(row.last_used_at),
    revokedAt: row.revoked_at === null || row.revoked_at === undefined ? null : Number(row.revoked_at),
  };
}

export function createKey(
  db: Db,
  input: { userId: string; name: string; prefix: string; keyHash: string }
): ApiKeyRow {
  const id = newId();
  db.prepare("INSERT INTO api_keys(id, user_id, name, prefix, key_hash, created_at, last_used_at, revoked_at) VALUES(?,?,?,?,?,?,NULL,NULL)").run(
    id,
    input.userId,
    input.name,
    input.prefix,
    input.keyHash,
    nowSeconds()
  );
  const row = db.prepare("SELECT * FROM api_keys WHERE id = ?").get(id) as Record<string, unknown>;
  return mapKey(row);
}

export function listKeys(db: Db, userId: string): ApiKeyRow[] {
  const rows = db.prepare("SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC").all(userId) as Record<
    string,
    unknown
  >[];
  return rows.map(mapKey);
}

export function findKeyByHash(db: Db, keyHash: string): ApiKeyWithUser | null {
  const row = db
    .prepare(
      "SELECT k.*, u.role AS role, u.timezone AS timezone, u.disabled AS disabled FROM api_keys k JOIN users u ON u.id = k.user_id WHERE k.key_hash = ?"
    )
    .get(keyHash) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    ...mapKey(row),
    role: String(row.role),
    timezone: String(row.timezone),
    disabled: Number(row.disabled) !== 0,
  };
}

export function touchKey(db: Db, id: string): void {
  db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(nowSeconds(), id);
}

export function revokeKey(db: Db, userId: string, id: string): boolean {
  const res = db
    .prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL")
    .run(nowSeconds(), id, userId);
  return Number(res.changes ?? 0) > 0;
}

