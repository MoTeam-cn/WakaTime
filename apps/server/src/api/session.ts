import type { AppState } from "../app.ts";
import type { Ctx } from "../http/context.ts";
import { HttpError, badRequest, conflict, forbidden, unauthorized } from "../http/context.ts";
import { created, noContent, ok } from "../http/respond.ts";
import { countUsers, createUser, findUserById, findUserByUsername } from "../store/users.ts";
import { createSession, findSessionByHash, revokeAllForUser, revokeSession } from "../store/sessions.ts";
import { logAudit } from "../store/audit.ts";
import { getMeta, setMeta } from "../store/meta.ts";
import { nowSeconds } from "../store/db.ts";
import {
  generateRefreshToken,
  hashPassword,
  passwordPolicyError,
  sha256Hex,
  signAccessToken,
  verifyPassword,
} from "../service/auth.ts";
import { parseCookies } from "../http/auth.ts";

interface PublicUser {
  id: string;
  username: string;
  role: string;
  timezone: string;
}

export function userPublic(user: PublicUser): PublicUser {
  return { id: user.id, username: user.username, role: user.role, timezone: user.timezone };
}

export function setAuthCookies(ctx: Ctx, state: AppState, accessToken: string, refreshToken: string): void {
  const secure = state.config.sessionCookieSecure ? "; Secure" : "";
  ctx.res.setHeader("Set-Cookie", [
    "waka_at=" + accessToken + "; HttpOnly; SameSite=Lax; Path=/; Max-Age=" + state.config.accessTokenTtl + secure,
    "waka_rt=" + refreshToken + "; HttpOnly; SameSite=Lax; Path=/v1/session; Max-Age=" + state.config.refreshTokenTtl + secure,
  ]);
}

function clearAuthCookies(ctx: Ctx): void {
  ctx.res.setHeader("Set-Cookie", [
    "waka_at=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
    "waka_rt=; HttpOnly; SameSite=Lax; Path=/v1/session; Max-Age=0",
  ]);
}

export function issueTokens(
  ctx: Ctx,
  state: AppState,
  user: PublicUser
): { accessToken: string; refreshToken: string; expiresIn: number } {
  const accessToken = signAccessToken(
    { userId: user.id, username: user.username, role: user.role, ttl: state.config.accessTokenTtl },
    state.jwtSecret
  );
  const refresh = generateRefreshToken();
  createSession(state.db, {
    userId: user.id,
    tokenHash: refresh.hash,
    expiresAt: nowSeconds() + state.config.refreshTokenTtl,
    userAgent: ctx.userAgent,
    ip: ctx.ip,
  });
  return { accessToken, refreshToken: refresh.token, expiresIn: state.config.accessTokenTtl };
}

export function isSetupDone(state: AppState): boolean {
  return getMeta(state.db, "setup_completed") === "1" || countUsers(state.db) > 0;
}

export function setupHandler(state: AppState) {
  return async (ctx: Ctx): Promise<void> => {
    if (isSetupDone(state)) throw conflict("系统已初始化，/v1/setup 已关闭", "setup_closed");
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const timezone = String(body.timezone ?? state.config.defaultTimezone).trim() || state.config.defaultTimezone;

    if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) throw badRequest("用户名需 3-32 位字母数字或 _ . -");
    const policyError = passwordPolicyError(password, username);
    if (policyError) throw badRequest(policyError);

    state.db.exec("BEGIN IMMEDIATE");
    let createdUser: PublicUser;
    try {
      if (countUsers(state.db) > 0) {
        state.db.exec("ROLLBACK");
        throw conflict("系统已初始化，/v1/setup 已关闭", "setup_closed");
      }
      createdUser = createUser(state.db, {
        username,
        passwordHash: hashPassword(password),
        role: "admin",
        timezone,
      });
      setMeta(state.db, "setup_completed", "1");
      state.db.exec("COMMIT");
    } catch (err) {
      try {
        state.db.exec("ROLLBACK");
      } catch {
        /* 已回滚 */
      }
      throw err;
    }

    logAudit(state.db, {
      userId: createdUser.id,
      action: "setup.complete",
      target: createdUser.username,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    created(ctx, { user: userPublic(createdUser) });
  };
}

export function loginHandler(state: AppState) {
  return async (ctx: Ctx): Promise<void> => {
    const limiterKey = "login:" + ctx.ip;
    if (state.loginLimiter.hit(limiterKey)) {
      throw new HttpError(429, "rate_limited", "登录尝试过于频繁，请稍后再试");
    }
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    if (!username || !password) throw badRequest("用户名与密码必填");

    const user = findUserByUsername(state.db, username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      logAudit(state.db, {
        userId: user?.id ?? null,
        action: "login.fail",
        target: username,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      throw unauthorized("用户名或密码错误");
    }
    if (user.disabled) throw forbidden("账号已被禁用");

    state.loginLimiter.reset(limiterKey);
    const tokens = issueTokens(ctx, state, user);
    setAuthCookies(ctx, state, tokens.accessToken, tokens.refreshToken);
    logAudit(state.db, { userId: user.id, action: "login.ok", target: username, ip: ctx.ip, userAgent: ctx.userAgent });

    ok(ctx, {
      access_token: tokens.accessToken,
      token_type: "Bearer",
      expires_in: tokens.expiresIn,
      refresh_token: tokens.refreshToken,
      user: userPublic(user),
    });
  };
}

export function currentSessionHandler(state: AppState) {
  return async (ctx: Ctx): Promise<void> => {
    if (!ctx.auth) throw unauthorized();
    const user = findUserById(state.db, ctx.auth.userId);
    if (!user) throw unauthorized();
    ok(ctx, { ...userPublic(user), via: ctx.auth.via });
  };
}

function refreshTokenFrom(ctx: Ctx): string | null {
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  if (typeof body.refresh_token === "string" && body.refresh_token.length > 0) return body.refresh_token;
  const cookies = parseCookies(ctx.req.headers.cookie);
  return cookies["waka_rt"] ?? null;
}

export function refreshHandler(state: AppState) {
  return async (ctx: Ctx): Promise<void> => {
    const token = refreshTokenFrom(ctx);
    if (!token) throw unauthorized("缺少 refresh token");
    const session = findSessionByHash(state.db, sha256Hex(token));
    if (!session || session.revokedAt !== null || session.expiresAt < nowSeconds()) {
      throw unauthorized("refresh token 无效或已过期");
    }
    const user = findUserById(state.db, session.userId);
    if (!user || user.disabled) throw unauthorized();

    revokeSession(state.db, session.id);
    const tokens = issueTokens(ctx, state, user);
    setAuthCookies(ctx, state, tokens.accessToken, tokens.refreshToken);
    logAudit(state.db, { userId: user.id, action: "session.refresh", ip: ctx.ip, userAgent: ctx.userAgent });

    ok(ctx, {
      access_token: tokens.accessToken,
      token_type: "Bearer",
      expires_in: tokens.expiresIn,
      refresh_token: tokens.refreshToken,
      user: userPublic(user),
    });
  };
}

export function logoutHandler(state: AppState) {
  return async (ctx: Ctx): Promise<void> => {
    const token = refreshTokenFrom(ctx);
    if (token) {
      const session = findSessionByHash(state.db, sha256Hex(token));
      if (session) revokeSession(state.db, session.id);
    }
    if (ctx.auth) {
      revokeAllForUser(state.db, ctx.auth.userId);
      logAudit(state.db, { userId: ctx.auth.userId, action: "logout", ip: ctx.ip, userAgent: ctx.userAgent });
    }
    clearAuthCookies(ctx);
    noContent(ctx);
  };
}

