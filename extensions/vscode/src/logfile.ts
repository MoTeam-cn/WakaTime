import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let target: string | null = null;
let enabled = false;

export function initLogFile(logFile: string, debug: boolean): void {
  enabled = true;
  if (logFile && logFile.trim().length > 0) {
    target = logFile.trim();
  } else {
    const dir = process.env.WAKATIME_HOME ? path.join(process.env.WAKATIME_HOME, ".wakatime") : path.join(os.homedir(), ".wakatime");
    target = path.join(dir, "waka-selfhost.log");
  }
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
  } catch {
    target = null;
  }
  if (debug) write("debug", "日志已初始化，目标: " + target);
}

export function write(level: string, message: string): void {
  if (!enabled || !target) return;
  try {
    fs.appendFileSync(target, new Date().toISOString() + " [" + level + "] " + message + "\n", "utf8");
  } catch {
    /* 写失败不抛 */
  }
}

export function currentLogPath(): string | null {
  return target;
}

