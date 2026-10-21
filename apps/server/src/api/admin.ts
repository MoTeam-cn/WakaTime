import type { AppState } from "../app.ts";
import type { Ctx } from "../http/context.ts";
import { badRequest, conflict, forbidden, notFound, unauthorized } from "../http/context.ts";
import { created, noContent, ok } from "../http/respond.ts";
import { countAdmins, createUser, deleteUser, findUserById, listUsers, updatePassword, updateUser } from "../store/users.ts";
import { revokeAllForUser } from "../store/sessions.ts";
import { listAudit, logAudit } from "../store/audit.ts";
import { hashPassword, passwordPolicyError } from "../service/auth.ts";
import { userPublic } from "./session.ts";

function requireAdmin(ctx: Ctx) {
  if (!ctx.auth) throw unauthorized();
  if (ctx.auth.role !== "admin") throw forbidden("需要管理员权限");
  return ctx.auth;
}

export function listUsersHandler(state: AppState) {
  return async (ctx: Ctx): Promise<void> => {
    requireAdmin(ctx);
    const page = Math.max(1, Number(ctx.query.get("page") ?? 1));
    const perPage = Math.min(100, Math.max(1, Number(ctx.query.get("per_page") ?? 20)));
    const { users, total } = listUsers(state.db, page, perPage);
    ok(ctx, users.map(userPublic), { "X-Total-Count": String(total) });
  };
}

export function createUserHandler(state: AppState) {
  return async (ctx: Ctx): Promise<void> => {
    const admin = requireAdmin(ctx);
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const role = body.role === "admin" ? "admin" : "member";
    const timezone = String(body.timezone ?? state.config.defaultTimezone).trim() || state.config.defaultTimezone;

    if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) throw badRequest("用户名需 3-32 位字母数字或 _ . -");
    const policyError = passwordPolicyError(password, username);
    if (policyError) throw badRequest(policyError);

    let user;
    try {
      user = createUser(state.db, { username, passwordHash: hashPassword(password), role, timezone });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("UNIQUE")) throw conflict("用户名已存在");
      throw err;
    }
    logAudit(state.db, { userId: admin.userId, action: "user.create", target: user.username, ip: ctx.ip, userAgent: ctx.userAgent });
    created(ctx, userPublic(user));
  };
}

export function patchUserHandler(state: AppState) {
  return async (ctx: Ctx, params: Record<string, string>): Promise<void> => {
    const admin = requireAdmin(ctx);
    const target = findUserById(state.db, params.id);
    if (!target) throw notFound("用户不存在");
    const body = (ctx.body ?? {}) as Record<string, unknown>;

    const nextRole = body.role === undefined ? undefined : body.role === "admin" ? "admin" : "member";
    const nextDisabled = body.disabled === undefined ? undefined : Boolean(body.disabled);
    const nextTimezone = body.timezone === undefined ? undefined : String(body.timezone);

    const losesAdmin =
      target.role === "admin" && ((nextRole !== undefined && nextRole !== "admin") || nextDisabled === true);
    if (losesAdmin && countAdmins(state.db) <= 1) throw conflict("不能降级或禁用最后一个管理员");
    if (target.id === admin.userId && nextDisabled === true) throw conflict("不能禁用自己的账号");

    const updated = updateUser(state.db, target.id, {
      role: nextRole,
      disabled: nextDisabled,
      timezone: nextTimezone,
    });
    if (!updated) throw notFound("用户不存在");
    if (nextDisabled === true) revokeAllForUser(state.db, target.id);

    logAudit(state.db, { userId: admin.userId, action: "user.update", target: target.username, ip: ctx.ip, userAgent: ctx.userAgent, meta: body });
    ok(ctx, userPublic(updated));
  };
}

export function resetPasswordHandler(state: AppState) {
  return async (ctx: Ctx, params: Record<string, string>): Promise<void> => {
    const admin = requireAdmin(ctx);
    const target = findUserById(state.db, params.id);
    if (!target) throw notFound("用户不存在");
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const password = String(body.password ?? "");
    const policyError = passwordPolicyError(password, target.username);
    if (policyError) throw badRequest(policyError);
    updatePassword(state.db, target.id, hashPassword(password));
    revokeAllForUser(state.db, target.id);
    logAudit(state.db, { userId: admin.userId, action: "user.password", target: target.username, ip: ctx.ip, userAgent: ctx.userAgent });
    noContent(ctx);
  };
}

export function deleteUserHandler(state: AppState) {
  return async (ctx: Ctx, params: Record<string, string>): Promise<void> => {
    const admin = requireAdmin(ctx);
    if (params.id === admin.userId) throw conflict("不能删除自己");
    const target = findUserById(state.db, params.id);
    if (!target) throw notFound("用户不存在");
    if (target.role === "admin" && countAdmins(state.db) <= 1) throw conflict("不能删除最后一个管理员");
    deleteUser(state.db, target.id);
    logAudit(state.db, { userId: admin.userId, action: "user.delete", target: target.username, ip: ctx.ip, userAgent: ctx.userAgent });
    noContent(ctx);
  };
}

export function auditHandler(state: AppState) {
  return async (ctx: Ctx): Promise<void> => {
    requireAdmin(ctx);
    const page = Math.max(1, Number(ctx.query.get("page") ?? 1));
    const perPage = Math.min(200, Math.max(1, Number(ctx.query.get("per_page") ?? 50)));
    const { entries, total } = listAudit(
      state.db,
      {
        action: ctx.query.get("action") ?? undefined,
        userId: ctx.query.get("user_id") ?? undefined,
        from: ctx.query.get("from") ? Number(ctx.query.get("from")) : undefined,
        to: ctx.query.get("to") ? Number(ctx.query.get("to")) : undefined,
      },
      page,
      perPage
    );
    ok(ctx, entries, { "X-Total-Count": String(total) });
  };
}

