import http from "node:http";
import type { IncomingMessage } from "node:http";
import type { AppState } from "../app.ts";
import type { Ctx } from "./context.ts";
import { HttpError } from "./context.ts";
import { authenticate } from "./auth.ts";
import { fail } from "./respond.ts";
import { log } from "../logger.ts";

const MAX_BODY = 1024 * 1024;

function readRawBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new HttpError(400, "invalid_request", "请求体过大（上限 1MB）"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", (err) => reject(err));
  });
}

function parseForm(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const params = new URLSearchParams(raw);
  for (const [k, v] of params) out[k] = v;
  return out;
}

export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const fwd = req.headers["x-forwarded-for"];
    if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0].trim();
    const real = req.headers["x-real-ip"];
    if (typeof real === "string" && real.length > 0) return real;
  }
  return req.socket.remoteAddress ?? "unknown";
}

export function createHttpServer(state: AppState): http.Server {
  return http.createServer(async (req, res) => {
    const started = Date.now();
    const rawUrl = req.url ?? "/";
    const url = new URL(rawUrl, "http://localhost");
    const method = (req.method ?? "GET").toUpperCase();
    const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null;

    const ctx: Ctx = {
      req,
      res,
      url,
      method,
      path: url.pathname,
      params: {},
      query: url.searchParams,
      auth: null,
      body: undefined,
      ip: clientIp(req, state.config.trustProxy),
      userAgent,
    };

    try {
      if (method === "POST" || method === "PATCH" || method === "PUT") {
        const raw = await readRawBody(req);
        const contentType = String(req.headers["content-type"] ?? "");
        if (contentType.includes("application/json")) {
          ctx.body = raw.length > 0 ? JSON.parse(raw) : {};
        } else if (contentType.includes("application/x-www-form-urlencoded")) {
          ctx.body = parseForm(raw);
        } else {
          try {
            ctx.body = raw.length > 0 ? JSON.parse(raw) : {};
          } catch {
            ctx.body = parseForm(raw);
          }
        }
      }

      ctx.auth = authenticate(req, url, state.db, state.jwtSecret);

      if (url.pathname.startsWith("/v1/")) {
        if (state.apiLimiter.hit(ctx.auth?.userId ?? ctx.ip)) {
          throw new HttpError(429, "rate_limited", "请求过于频繁");
        }
      }

      const matched = state.router.match(method, url.pathname);
      if (!matched) {
        if (url.pathname.startsWith("/v1/")) {
          throw new HttpError(404, "not_found", "未知端点: " + method + " " + url.pathname);
        }
        throw new HttpError(404, "not_found", "页面不存在");
      }
      ctx.params = matched.params;
      await matched.handler(ctx, matched.params);

      if (state.config.logLevel === "debug") {
        log.debug("request", { method, path: url.pathname, status: res.statusCode, ms: Date.now() - started });
      }
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status >= 500) log.error("request failed", { method, path: url.pathname, error: String(err) });
      if (!res.headersSent) fail(ctx, err);
      else res.end();
    }
  });
}

