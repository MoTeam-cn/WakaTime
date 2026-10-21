import type { Db } from "./db.ts";
import { newId, nowSeconds } from "./db.ts";

export type Role = "admin" | "member";

export interface User {
  id: string;
  username: string;
  role: Role;
  timezone: string;
  disabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface UserRow extends User {
  passwordHash: string;
}

function mapUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    username: String(row.username),
    role: String(row.role) as Role,
    timezone: String(row.timezone),
    disabled: Number(row.disabled) !== 0,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function mapUserRow(row: Record<string, unknown>): UserRow {
  return { ...mapUser(row), passwordHash: String(row.password_hash) };
}

export function countUsers(db: Db): number {
  const row = db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number };
  return Number(row.c);
}

export function countAdmins(db: Db): number {
  const row = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = ? AND disabled = 0").get("admin") as { c: number };
  return Number(row.c);
}

export function createUser(
  db: Db,
  input: { username: string; passwordHash: string; role?: Role; timezone?: string }
): User {
  const id = newId();
  const now = nowSeconds();
  db.prepare(
    "INSERT INTO users(id, username, password_hash, role, timezone, disabled, created_at, updated_at) VALUES(?,?,?,?,?,0,?,?)"
  ).run(id, input.username, input.passwordHash, input.role ?? "member", input.timezone ?? "Asia/Shanghai", now, now);
  const created = findUserById(db, id);
  if (!created) throw new Error("createUser failed");
  return created;
}

export function findUserById(db: Db, id: string): User | null {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? mapUser(row) : null;
}

export function findUserWithHashById(db: Db, id: string): UserRow | null {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? mapUserRow(row) : null;
}

export function findUserByUsername(db: Db, username: string): UserRow | null {
  const row = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(username) as
    | Record<string, unknown>
    | undefined;
  return row ? mapUserRow(row) : null;
}

export function listUsers(db: Db, page: number, perPage: number): { users: User[]; total: number } {
  const total = countUsers(db);
  const offset = Math.max(0, (page - 1) * perPage);
  const rows = db.prepare("SELECT * FROM users ORDER BY created_at ASC LIMIT ? OFFSET ?").all(perPage, offset) as Record<
    string,
    unknown
  >[];
  return { users: rows.map(mapUser), total };
}

export function updateUser(
  db: Db,
  id: string,
  patch: { role?: Role; timezone?: string; disabled?: boolean }
): User | null {
  const cur = findUserById(db, id);
  if (!cur) return null;
  const role = patch.role ?? cur.role;
  const timezone = patch.timezone ?? cur.timezone;
  const disabled = patch.disabled === undefined ? (cur.disabled ? 1 : 0) : patch.disabled ? 1 : 0;
  db.prepare("UPDATE users SET role = ?, timezone = ?, disabled = ?, updated_at = ? WHERE id = ?").run(
    role,
    timezone,
    disabled,
    nowSeconds(),
    id
  );
  return findUserById(db, id);
}

export function updatePassword(db: Db, id: string, passwordHash: string): void {
  db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(passwordHash, nowSeconds(), id);
}

export function deleteUser(db: Db, id: string): void {
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
}

