import fs from "node:fs";
import path from "node:path";

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  dbPath: string;
  logPath: string;
  jwtSecret: string | null;
  accessTokenTtl: number;
  refreshTokenTtl: number;
  defaultTimezone: string;
  publicUrl: string | null;
  logLevel: "debug" | "info" | "warn" | "error";
  heartbeatTimeout: number;
  maxGap: number;
  trustProxy: boolean;
  sessionCookieSecure: boolean;
  /** 版本号，用于静态资源 ?v= 与 /v1/meta 输出 */
  appVersion: string;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

/** 版本号：优先环境变量，其次向上找 name 为 waka-selfhost 的 package.json */
function readAppVersion(): string {
  const fromEnv = process.env.APP_VERSION;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim();
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as { name?: string; version?: string };
      if (pkg.name === "waka-selfhost" && pkg.version) return pkg.version;
    } catch { /* 继续向上找 */ }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "dev";
}

export function loadConfig(): Config {
  const dataDir = process.env.DATA_DIR ?? path.resolve(process.cwd(), "data");
  const publicUrl = process.env.PUBLIC_URL ?? null;
  return {
    port: intEnv("PORT", 8800),
    host: process.env.HOST ?? "0.0.0.0",
    dataDir,
    dbPath: process.env.DB_PATH ?? path.join(dataDir, "waka.db"),
    logPath: process.env.LOG_PATH ?? path.join(dataDir, "waka.log"),
    jwtSecret: process.env.JWT_SECRET ?? null,
    accessTokenTtl: intEnv("ACCESS_TOKEN_TTL", 7200),
    refreshTokenTtl: intEnv("REFRESH_TOKEN_TTL", 30 * 24 * 3600),
    defaultTimezone: process.env.TZ ?? "Asia/Shanghai",
    publicUrl,
    logLevel: (process.env.LOG_LEVEL as Config["logLevel"]) ?? "info",
    heartbeatTimeout: intEnv("HEARTBEAT_TIMEOUT", 900),
    maxGap: intEnv("MAX_GAP_SECONDS", 0),
    trustProxy: boolEnv("TRUST_PROXY", true),
    sessionCookieSecure: publicUrl ? publicUrl.startsWith("https://") : false,
    appVersion: readAppVersion(),
  };
}

