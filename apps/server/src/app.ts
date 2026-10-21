import type { Db } from "./store/db.ts";
import type { Config } from "./config.ts";
import { Router } from "./http/router.ts";
import { RateLimiter } from "./http/rate-limit.ts";

export interface AppState {
  db: Db;
  config: Config;
  jwtSecret: string;
  startedAt: number;
  router: Router;
  loginLimiter: RateLimiter;
  apiLimiter: RateLimiter;
}

export type HandlerFactory = (state: AppState) => void;

