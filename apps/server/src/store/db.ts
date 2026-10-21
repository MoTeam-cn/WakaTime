import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "./migrate.ts";

export type Db = DatabaseSync;

export function openDatabase(dbPath: string): Db {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  migrate(db);
  return db;
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function newId(): string {
  return crypto.randomUUID();
}

