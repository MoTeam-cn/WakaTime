import fs from "node:fs";
import path from "node:path";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

let currentLevel: number = LEVELS.info;
let stream: fs.WriteStream | null = null;

export function initLogger(logPath: string | null, level: Level): void {
  currentLevel = LEVELS[level] ?? LEVELS.info;
  if (logPath) {
    try {
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      stream = fs.createWriteStream(logPath, { flags: "a" });
    } catch {
      stream = null;
    }
  }
}

function write(level: Level, msg: string, extra?: Record<string, unknown>): void {
  if (LEVELS[level] < currentLevel) return;
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level,
    msg,
    ...(extra ?? {}),
  });
  if (level === "error" || level === "warn") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
  if (stream) stream.write(line + "\n");
}

export const log = {
  debug: (msg: string, extra?: Record<string, unknown>) => write("debug", msg, extra),
  info: (msg: string, extra?: Record<string, unknown>) => write("info", msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => write("warn", msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => write("error", msg, extra),
};

