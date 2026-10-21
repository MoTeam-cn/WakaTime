import type { AppState } from "../app.ts";
import type { Ctx } from "../http/context.ts";
import { badRequest, notFound, unauthorized } from "../http/context.ts";
import { json, ok } from "../http/respond.ts";
import {
  summarizeDay,
  summarizeRange,
  buildTotal,
  sumDuration,
} from "@waka/core";
import type { Duration, DaySummary } from "@waka/core";
import { listDurationsByDay, listDurationsBetween, listAllDurations } from "../store/durations.ts";
import { distinctMachines, distinctProjects, distinctUserAgents, countHeartbeats } from "../store/heartbeats.ts";
import { findUserById } from "../store/users.ts";
import { dayRange, todayInTz } from "../service/aggregate-service.ts";

function requireAuth(ctx: Ctx) {
  if (!ctx.auth) throw unauthorized();
  return ctx.auth;
}

function toApiSummary(day: DaySummary, timezone: string) {
  return {
    grand_total: day.grandTotal,
    categories: day.categories,
    dependencies: day.dependencies,
    editors: day.editors,
    languages: day.languages,
    machines: day.machines,
    operating_systems: day.operatingSystems,
    projects: day.projects,
    branches: day.branches,
    entities: day.entities,
    range: { date: day.date, text: day.date, timezone },
  };
}

function filterDurations(
  durations: Duration[],
  opts: { project?: string | null; branches?: string[]; editor?: string | null; writesOnly?: boolean }
): Duration[] {
  return durations.filter((d) => {
    if (opts.project && d.project !== opts.project) return false;
    if (opts.branches && opts.branches.length > 0 && (!d.branch || !opts.branches.includes(d.branch))) return false;
    if (opts.editor && d.editor !== opts.editor) return false;
    if (opts.writesOnly && !d.isWrite) return false;
    return true;
  });
}

function parseBranches(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  return raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

function isValidDay(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s + "T00:00:00Z").getTime());
}

export function statusBarTodayHandler(state: AppState) {
  return async (ctx: Ctx): Promise<void> => {
    const auth = requireAuth(ctx);
    const day = todayInTz(auth.timezone);
    let durations = listDurationsByDay(state.db, auth.userId, day);
    durations = filterDurations(durations, {
      project: ctx.query.get("project"),
      branches: parseBranches(ctx.query.get("branches")),
      editor: ctx.query.get("editor"),
    });
    const summary = summarizeDay(day, durations);
    ok(ctx, {
      grand_total: summary.grandTotal,
      categories: summary.categories,
      dependencies: summary.dependencies,
      editors: summary.editors,
      languages: summary.languages,
      machines: summary.machines,
      operating_systems: summary.operatingSystems,
      projects: summary.projects,
      branches: summary.branches,
      range: { date: day, text: "Today", timezone: auth.timezone },
    });
  };
}

export function durationsHandler(state: AppState) {
  return async (ctx: Ctx): Promise<void> => {
    const auth = requireAuth(ctx);
    const date = ctx.query.get("date") ?? todayInTz(auth.timezone);
    if (!isValidDay(date)) throw badRequest("date 需为 YYYY-MM-DD");
    let durations = listDurationsByDay(state.db, auth.userId, date);
    durations = filterDurations(durations, {
      project: ctx.query.get("project"),
      branches: parseBranches(ctx.query.get("branches")),
      writesOnly: ctx.query.get("writes_only") === "true",
    });
    const data = durations.map((d) => [
      Math.round(d.duration * 100) / 100,
      {
        entity: d.entity,
        type: "file",
        category: d.category,
        time: d.startTime,
        project: d.project,
        branch: d.branch,
        language: d.language,
        dependencies: [],
        is_write: d.isWrite,
        machine_name_id: d.machineNameId,
      },
    ]);
    const startEpoch = Math.floor(new Date(date + "T00:00:00Z").getTime() / 1000);
    json(ctx, 200, {
      data,
      start: new Date(startEpoch * 1000).toISOString(),
      end: new Date((startEpoch + 86399) * 1000).toISOString(),
      timezone: auth.timezone,
    });
  };
}

export function summariesHandler(state: AppState) {
  return async (ctx: Ctx): Promise<void> => {
    const auth = requireAuth(ctx);
    const today = todayInTz(auth.timezone);
    const end = ctx.query.get("end") ?? today;
    const startParam = ctx.query.get("start");
    let start: string;
    if (startParam) start = startParam;
    else {
      const d = new Date(today + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - 6);
      start = d.toISOString().slice(0, 10);
    }
    if (!isValidDay(start) || !isValidDay(end)) throw badRequest("start/end 需为 YYYY-MM-DD");
    if (start > end) throw badRequest("start 不能晚于 end");

    const days = dayRange(start, end);
    if (days.length === 0) throw badRequest("日期区间无效");
    if (days.length > 366) throw badRequest("区间过长，最多 366 天");

    const all = filterDurations(listDurationsBetween(state.db, auth.userId, start, end), {
      project: ctx.query.get("project"),
      branches: parseBranches(ctx.query.get("branches")),
      writesOnly: ctx.query.get("writes_only") === "true",
    });

    const byDay = new Map<string, Duration[]>();
    for (const d of all) {
      const list = byDay.get(d.day) ?? [];
      list.push(d);
      byDay.set(d.day, list);
    }

    const data = days.map((day) => toApiSummary(summarizeDay(day, byDay.get(day) ?? []), auth.timezone));
    const cumulative = buildTotal(sumDuration(all));
    json(ctx, 200, {
      data,
      cumulative_total: cumulative,
      start: start + "T00:00:00Z",
      end: end + "T23:59:59Z",
      branches: [],
    });
  };
}

const RANGE_DAYS: Record<string, number> = {
  last_7_days: 7,
  last_30_days: 30,
  last_6_months: 182,
  last_year: 365,
};

export function statsHandler(state: AppState) {
  return async (ctx: Ctx, params: Record<string, string>): Promise<void> => {
    const auth = requireAuth(ctx);
    const range = params.range;
    const today = todayInTz(auth.timezone);
    let durations: Duration[];
    let startDay: string;

    if (range === "all_time") {
      durations = listAllDurations(state.db, auth.userId);
      startDay = durations.length > 0 ? durations[0].day : today;
    } else {
      const n = RANGE_DAYS[range];
      if (!n) throw notFound("未知的 range: " + range);
      const d = new Date(today + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - (n - 1));
      startDay = d.toISOString().slice(0, 10);
      durations = listDurationsBetween(state.db, auth.userId, startDay, today);
    }

    const agg = summarizeRange(durations);
    const days = dayRange(startDay, today).length || 1;
    const total = agg.grandTotal.total_seconds;

    const byDay = new Map<string, number>();
    for (const d of durations) byDay.set(d.day, (byDay.get(d.day) ?? 0) + d.duration);
    let bestDay: { date: string; total_seconds: number; text: string } | null = null;
    for (const [date, seconds] of byDay) {
      if (!bestDay || seconds > bestDay.total_seconds) {
        bestDay = { date, total_seconds: Math.round(seconds), text: buildTotal(seconds).text };
      }
    }

    ok(ctx, {
      total_seconds: total,
      human_readable_total: agg.grandTotal.text,
      daily_average: Math.round((total / days) * 100) / 100,
      human_readable_daily_average: buildTotal(total / days).text,
      days_including_holidays: days,
      best_day: bestDay,
      categories: agg.categories,
      editors: agg.editors,
      languages: agg.languages,
      machines: agg.machines,
      operating_systems: agg.operatingSystems,
      projects: agg.projects,
      branches: agg.branches,
      range: { start: startDay, end: today, text: range, timezone: auth.timezone },
    });
  };
}

export function allTimeHandler(state: AppState) {
  return async (ctx: Ctx): Promise<void> => {
    const auth = requireAuth(ctx);
    const durations = listAllDurations(state.db, auth.userId);
    const total = buildTotal(sumDuration(durations));
    const firstDay = durations.length > 0 ? durations[0].day : todayInTz(auth.timezone);
    ok(ctx, {
      text: total.text,
      total_seconds: total.total_seconds,
      range: { date: firstDay, text: firstDay, timezone: auth.timezone },
    });
  };
}

export function machineNamesHandler(state: AppState) {
  return async (ctx: Ctx): Promise<void> => {
    const auth = requireAuth(ctx);
    const rows = distinctMachines(state.db, auth.userId);
    ok(
      ctx,
      rows.map((r) => ({
        id: r.id,
        name: r.id,
        ip: null,
        last_seen_at: new Date(r.lastSeen * 1000).toISOString(),
        timezone: auth.timezone,
      }))
    );
  };
}

export function userAgentsHandler(state: AppState) {
  return async (ctx: Ctx): Promise<void> => {
    const auth = requireAuth(ctx);
    const rows = distinctUserAgents(state.db, auth.userId);
    ok(
      ctx,
      rows.map((r) => {
        const parts = r.ua.split(" ");
        const first = parts[0] ?? r.ua;
        const slash = first.indexOf("/");
        return {
          id: r.ua,
          editor: slash >= 0 ? first.slice(0, slash) : first,
          version: slash >= 0 ? first.slice(slash + 1) : null,
          os: null,
          last_seen_at: new Date(r.lastSeen * 1000).toISOString(),
        };
      })
    );
  };
}

export function projectsHandler(state: AppState) {
  return async (ctx: Ctx): Promise<void> => {
    const auth = requireAuth(ctx);
    const q = (ctx.query.get("q") ?? "").toLowerCase();
    const names = distinctProjects(state.db, auth.userId).filter((p) => p.toLowerCase().includes(q));
    const perPage = Math.min(100, Math.max(1, Number(ctx.query.get("per_page") ?? 20)));
    const page = Math.max(1, Number(ctx.query.get("page") ?? 1));
    const slice = names.slice((page - 1) * perPage, page * perPage);
    ok(
      ctx,
      slice.map((name) => ({ id: name, name, repository: null, url: null, last_heartbeat_at: null }))
    );
  };
}

export function currentUserHandler(state: AppState) {
  return async (ctx: Ctx): Promise<void> => {
    const auth = requireAuth(ctx);
    const user = findUserById(state.db, auth.userId);
    if (!user) throw unauthorized();
    ok(ctx, {
      id: user.id,
      username: user.username,
      role: user.role,
      timezone: user.timezone,
      created_at: new Date(user.createdAt * 1000).toISOString(),
      heartbeat_count: countHeartbeats(state.db, user.id),
    });
  };
}


