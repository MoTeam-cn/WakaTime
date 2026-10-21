import crypto from "node:crypto";
import path from "node:path";
import { loadConfig } from "./config.ts";
import { initLogger, log } from "./logger.ts";
import { openDatabase } from "./store/db.ts";
import { getMeta, setMeta } from "./store/meta.ts";
import { Router } from "./http/router.ts";
import { RateLimiter } from "./http/rate-limit.ts";
import { createHttpServer } from "./http/server.ts";
import type { AppState } from "./app.ts";
import { currentSessionHandler, loginHandler, logoutHandler, refreshHandler, setupHandler } from "./api/session.ts";
import { bulkHeartbeatsHandler, singleHeartbeatHandler } from "./api/heartbeats.ts";
import {
  allTimeHandler,
  currentUserHandler,
  durationsHandler,
  machineNamesHandler,
  projectsHandler,
  statsHandler,
  statusBarTodayHandler,
  summariesHandler,
  userAgentsHandler,
} from "./api/read.ts";
import { healthHandler, metaHandler, pluginsHandler, registerNotImplemented } from "./api/misc.ts";
import { createKeyHandler, listKeysHandler, revokeKeyHandler } from "./api/keys.ts";
import {
  auditHandler,
  createUserHandler,
  deleteUserHandler,
  listUsersHandler,
  patchUserHandler,
  resetPasswordHandler,
} from "./api/admin.ts";
import { registerWebRoutes } from "./web/routes.ts";
import { setAssetVersion } from "./web/layout.ts";
import { deleteExpiredSessions } from "./store/sessions.ts";
import { deleteAuditOlderThan } from "./store/audit.ts";

export function buildState(overrides: Partial<AppState> = {}): AppState {
  const config = loadConfig();
  const db = openDatabase(config.dbPath);

  let jwtSecret = config.jwtSecret;
  if (!jwtSecret) {
    const stored = getMeta(db, "jwt_secret");
    if (stored) jwtSecret = stored;
    else {
      jwtSecret = crypto.randomBytes(32).toString("base64url");
      setMeta(db, "jwt_secret", jwtSecret);
      log.warn("JWT_SECRET 未设置，已自动生成并存入数据库；生产环境建议显式设置");
    }
  }

  const state: AppState = {
    db,
    config,
    jwtSecret,
    startedAt: Date.now(),
    router: new Router(),
    loginLimiter: new RateLimiter(5, 5 * 60 * 1000),
    apiLimiter: new RateLimiter(600, 60 * 1000),
    ...overrides,
  };

  setAssetVersion(config.appVersion);
  registerRoutes(state);
  return state;
}

export function registerRoutes(state: AppState): void {
  const r = state.router;

  r.get("/healthz", healthHandler(state));
  r.post("/v1/setup", setupHandler(state));
  r.post("/v1/session", loginHandler(state));
  r.get("/v1/session", currentSessionHandler(state));
  r.post("/v1/session/refresh", refreshHandler(state));
  r.delete("/v1/session", logoutHandler(state));

  r.post("/v1/users/:username/heartbeats.bulk", bulkHeartbeatsHandler(state));
  r.post("/v1/users/:username/heartbeats", singleHeartbeatHandler(state));

  r.get("/v1/users/:username/status_bar/today", statusBarTodayHandler(state));
  r.get("/v1/users/:username/durations", durationsHandler(state));
  r.get("/v1/users/:username/summaries", summariesHandler(state));
  r.get("/v1/users/:username/stats/:range", statsHandler(state));
  r.get("/v1/users/:username/all_time_since_today", allTimeHandler(state));
  r.get("/v1/users/:username/machine_names", machineNamesHandler(state));
  r.get("/v1/users/:username/user_agents", userAgentsHandler(state));
  r.get("/v1/users/:username/projects", projectsHandler(state));

  r.get("/v1/users/current", currentUserHandler(state));

  r.get("/v1/plugins", pluginsHandler());
  r.get("/v1/meta", metaHandler(state));

  r.get("/v1/users/current/api_keys", listKeysHandler(state));
  r.post("/v1/users/current/api_keys", createKeyHandler(state));
  r.delete("/v1/users/current/api_keys/:id", revokeKeyHandler(state));

  r.get("/v1/admin/users", listUsersHandler(state));
  r.post("/v1/admin/users", createUserHandler(state));
  r.patch("/v1/admin/users/:id", patchUserHandler(state));
  r.post("/v1/admin/users/:id/password", resetPasswordHandler(state));
  r.delete("/v1/admin/users/:id", deleteUserHandler(state));
  r.get("/v1/admin/audit", auditHandler(state));

  // 兼容：官方 CLI 可能硬编码 /api/v1 前缀
  r.get("/api/v1/plugins", pluginsHandler());

  registerNotImplemented(state);
  registerWebRoutes(state);
}

function start(): void {
  const config = loadConfig();
  initLogger(config.logPath, config.logLevel);
  const state = buildState();
  const server = createHttpServer(state);

  const housekeeping = setInterval(() => {
    try {
      deleteExpiredSessions(state.db);
      deleteAuditOlderThan(state.db, Math.floor(Date.now() / 1000) - 90 * 24 * 3600);
      state.apiLimiter.cleanup();
      state.loginLimiter.cleanup();
    } catch (err) {
      log.error("housekeeping failed", { error: String(err) });
    }
  }, 60 * 60 * 1000);
  housekeeping.unref();

  server.listen(config.port, config.host, () => {
    log.info("waka-selfhost listening", { port: config.port, db: config.dbPath });
  });

  const shutdown = (signal: string) => {
    log.info("shutting down", { signal });
    server.close(() => {
      try {
        state.db.close();
      } catch {
        /* ignore */
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]).includes("main.");
if (isMain) start();

