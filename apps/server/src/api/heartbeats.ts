import type { AppState } from "../app.ts";
import type { Ctx } from "../http/context.ts";
import { badRequest, forbidden, unauthorized } from "../http/context.ts";
import { json } from "../http/respond.ts";
import { normalizeHeartbeat, HeartbeatError } from "@waka/core";
import type { Heartbeat } from "@waka/core";
import { insertHeartbeats } from "../store/heartbeats.ts";
import { findUserByUsername } from "../store/users.ts";
import { recomputeFrom } from "../service/aggregate-service.ts";

const MAX_BATCH = 25;

function resolveTargetUser(
  state: AppState,
  ctx: Ctx,
  usernameParam: string | null
): { id: string; timezone: string } {
  if (!ctx.auth) throw unauthorized();
  if (!usernameParam || usernameParam === "current") {
    return { id: ctx.auth.userId, timezone: ctx.auth.timezone };
  }
  if (usernameParam === ctx.auth.username) return { id: ctx.auth.userId, timezone: ctx.auth.timezone };
  if (ctx.auth.role !== "admin") throw forbidden("只能为自己的账号上报");
  const user = findUserByUsername(state.db, usernameParam);
  if (!user) throw badRequest("目标用户不存在");
  return { id: user.id, timezone: user.timezone };
}

function ingest(
  state: AppState,
  target: { id: string; timezone: string },
  items: Heartbeat[]
): void {
  if (items.length === 0) return;
  insertHeartbeats(state.db, target.id, items);
  let earliest = items[0].time;
  for (const it of items) if (it.time < earliest) earliest = it.time;
  recomputeFrom(state.db, target.id, earliest, {
    timezone: target.timezone,
    timeout: state.config.heartbeatTimeout,
    maxGap: state.config.maxGap,
  });
}

function normalizeList(
  ctx: Ctx,
  raw: unknown
): { ok: Heartbeat[]; errors: { index: number; message: string }[] } {
  const arr = Array.isArray(raw) ? raw : [raw];
  const okList: Heartbeat[] = [];
  const errors: { index: number; message: string }[] = [];
  arr.forEach((item, index) => {
    try {
      okList.push(normalizeHeartbeat(item, ctx.userAgent));
    } catch (err) {
      if (err instanceof HeartbeatError) errors.push({ index, message: err.field + ": " + err.message });
      else errors.push({ index, message: "invalid heartbeat" });
    }
  });
  return { ok: okList, errors };
}

export function bulkHeartbeatsHandler(state: AppState) {
  return async (ctx: Ctx, params: Record<string, string>): Promise<void> => {
    const target = resolveTargetUser(state, ctx, params.username ?? null);
    const raw = ctx.body;
    if (!Array.isArray(raw)) throw badRequest("bulk 端点需要数组 body");
    if (raw.length > MAX_BATCH) throw badRequest("单次最多 " + MAX_BATCH + " 条心跳");

    const { ok: list, errors } = normalizeList(ctx, raw);
    ingest(state, target, list);

    const responses: [unknown, number][] = [];
    raw.forEach((_item, index) => {
      const err = errors.find((e) => e.index === index);
      responses.push(err ? [{ error: err.message }, 400] : [null, 201]);
    });
    json(ctx, 201, { responses });
  };
}

export function singleHeartbeatHandler(state: AppState) {
  return async (ctx: Ctx, params: Record<string, string>): Promise<void> => {
    const target = resolveTargetUser(state, ctx, params.username ?? null);
    const { ok: list, errors } = normalizeList(ctx, ctx.body);
    if (errors.length > 0) throw badRequest(errors[0].message);
    ingest(state, target, list);
    json(ctx, 201, { data: { ok: true } });
  };
}

