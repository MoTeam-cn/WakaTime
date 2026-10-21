import type { AppState } from "../app.ts";
import type { Ctx } from "../http/context.ts";
import { badRequest, notFound, unauthorized } from "../http/context.ts";
import { created, noContent, ok } from "../http/respond.ts";
import { createKey, listKeys, revokeKey } from "../store/keys.ts";
import { generateApiKey } from "../service/auth.ts";
import { logAudit } from "../store/audit.ts";

export function listKeysHandler(state: AppState) {
  return async (ctx: Ctx): Promise<void> => {
    if (!ctx.auth) throw unauthorized();
    const rows = listKeys(state.db, ctx.auth.userId);
    ok(
      ctx,
      rows.map((k) => ({
        id: k.id,
        name: k.name,
        prefix: k.prefix,
        created_at: new Date(k.createdAt * 1000).toISOString(),
        last_used_at: k.lastUsedAt ? new Date(k.lastUsedAt * 1000).toISOString() : null,
        revoked: k.revokedAt !== null,
      }))
    );
  };
}

export function createKeyHandler(state: AppState) {
  return async (ctx: Ctx): Promise<void> => {
    if (!ctx.auth) throw unauthorized();
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    if (name.length < 1 || name.length > 64) throw badRequest("name 需 1-64 字符");

    const generated = generateApiKey();
    const row = createKey(state.db, {
      userId: ctx.auth.userId,
      name,
      prefix: generated.prefix,
      keyHash: generated.hash,
    });
    logAudit(state.db, { userId: ctx.auth.userId, action: "key.create", target: row.id, ip: ctx.ip, userAgent: ctx.userAgent });

    created(ctx, {
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      key: generated.key,
      created_at: new Date(row.createdAt * 1000).toISOString(),
    });
  };
}

export function revokeKeyHandler(state: AppState) {
  return async (ctx: Ctx, params: Record<string, string>): Promise<void> => {
    if (!ctx.auth) throw unauthorized();
    const okFlag = revokeKey(state.db, ctx.auth.userId, params.id);
    if (!okFlag) throw notFound("密钥不存在或已吊销");
    logAudit(state.db, { userId: ctx.auth.userId, action: "key.revoke", target: params.id, ip: ctx.ip, userAgent: ctx.userAgent });
    noContent(ctx);
  };
}

