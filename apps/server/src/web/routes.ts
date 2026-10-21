import type { AppState } from "../app.ts";
import type { Ctx } from "../http/context.ts";
import { html, redirect } from "../http/respond.ts";
import { findUserById, findUserByUsername, createUser, deleteUser, countUsers, listUsers } from "../store/users.ts";
import type { User } from "../store/users.ts";
import { listKeys, createKey, revokeKey } from "../store/keys.ts";
import { listAudit, logAudit } from "../store/audit.ts";
import { generateApiKey, hashPassword, passwordPolicyError, verifyPassword } from "../service/auth.ts";
import { isSetupDone, issueTokens, setAuthCookies } from "../api/session.ts";
import { dayRange, todayInTz } from "../service/aggregate-service.ts";
import { summarizeDay, summarizeRange, buildTotal, sumDuration } from "@waka/core";
import { listDurationsByDay, listDurationsBetween, listAllDurations } from "../store/durations.ts";
import { auditPage, adminUsersPage, loginPage, settingsPage, setupPage, statsPage, todayPage, errorPage } from "./pages.ts";
import type { StatsView } from "./pages.ts";

function currentUser(state: AppState, ctx: Ctx): User | null {
  if (!ctx.auth) return null;
  return findUserById(state.db, ctx.auth.userId);
}

function form(ctx: Ctx): Record<string, string> {
  const body = ctx.body;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) out[k] = String(v ?? "");
    return out;
  }
  return {};
}

function guard(state: AppState, ctx: Ctx): User | null {
  if (!isSetupDone(state)) {
    redirect(ctx, "/setup");
    return null;
  }
  const user = currentUser(state, ctx);
  if (!user) {
    redirect(ctx, "/login");
    return null;
  }
  return user;
}

function requireAdminPage(state: AppState, ctx: Ctx): User | null {
  const user = guard(state, ctx);
  if (!user) return null;
  if (user.role !== "admin") {
    html(ctx, 403, errorPage(user, "需要管理员权限"));
    return null;
  }
  return user;
}

export function registerWebRoutes(state: AppState): void {
  const r = state.router;

  r.get("/setup", async (ctx) => {
    if (isSetupDone(state)) {
      redirect(ctx, "/login");
      return;
    }
    html(ctx, 200, setupPage());
  });

  r.post("/setup", async (ctx) => {
    if (isSetupDone(state)) {
      html(ctx, 409, setupPage("系统已初始化"));
      return;
    }
    const f = form(ctx);
    const username = (f.username ?? "").trim();
    const password = f.password ?? "";
    const confirm = f.confirm ?? "";
    const timezone = (f.timezone ?? state.config.defaultTimezone).trim() || state.config.defaultTimezone;

    if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) {
      html(ctx, 400, setupPage("用户名需 3-32 位字母数字或 _ . -"));
      return;
    }
    if (password !== confirm) {
      html(ctx, 400, setupPage("两次输入的密码不一致"));
      return;
    }
    const policyError = passwordPolicyError(password, username);
    if (policyError) {
      html(ctx, 400, setupPage(policyError));
      return;
    }

    if (countUsers(state.db) > 0) {
      html(ctx, 409, setupPage("系统已初始化"));
      return;
    }
    const created = createUser(state.db, { username, passwordHash: hashPassword(password), role: "admin", timezone });
    logAudit(state.db, { userId: created.id, action: "setup.complete", target: username, ip: ctx.ip, userAgent: ctx.userAgent });
    redirect(ctx, "/login");
  });

  r.get("/login", async (ctx) => {
    if (!isSetupDone(state)) {
      redirect(ctx, "/setup");
      return;
    }
    html(ctx, 200, loginPage());
  });

  r.post("/login", async (ctx) => {
    const limiterKey = "login:" + ctx.ip;
    if (state.loginLimiter.hit(limiterKey)) {
      html(ctx, 429, loginPage("尝试过于频繁，请 5 分钟后再试"));
      return;
    }
    const f = form(ctx);
    const username = (f.username ?? "").trim();
    const password = f.password ?? "";
    const user = findUserByUsername(state.db, username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      logAudit(state.db, { userId: user?.id ?? null, action: "login.fail", target: username, ip: ctx.ip, userAgent: ctx.userAgent });
      html(ctx, 401, loginPage("用户名或密码错误"));
      return;
    }
    if (user.disabled) {
      html(ctx, 403, loginPage("账号已被禁用"));
      return;
    }
    state.loginLimiter.reset(limiterKey);
    const tokens = issueTokens(ctx, state, user);
    setAuthCookies(ctx, state, tokens.accessToken, tokens.refreshToken);
    logAudit(state.db, { userId: user.id, action: "login.ok", target: username, ip: ctx.ip, userAgent: ctx.userAgent });
    redirect(ctx, "/");
  });

  r.get("/logout", async (ctx) => {
    ctx.res.setHeader("Set-Cookie", [
      "waka_at=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
      "waka_rt=; HttpOnly; SameSite=Lax; Path=/v1/session; Max-Age=0",
    ]);
    redirect(ctx, "/login");
  });

  r.get("/", async (ctx) => {
    const user = guard(state, ctx);
    if (!user) return;
    const day = todayInTz(user.timezone);
    const durations = listDurationsByDay(state.db, user.id, day);
    const summary = summarizeDay(day, durations);
    const recent = durations.slice().sort((a, b) => b.startTime - a.startTime);
    html(ctx, 200, todayPage(user, summary, recent));
  });

  r.get("/stats", async (ctx) => {
    const user = guard(state, ctx);
    if (!user) return;
    const rawRange = ctx.query.get("range") ?? "7d";
    const range = rawRange === "30d" || rawRange === "all" ? rawRange : "7d";
    const today = todayInTz(user.timezone);

    let startDay: string;
    let durations;
    if (range === "all") {
      durations = listAllDurations(state.db, user.id);
      startDay = durations.length > 0 ? durations[0].day : today;
    } else {
      const n = range === "30d" ? 30 : 7;
      const d = new Date(today + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - (n - 1));
      startDay = d.toISOString().slice(0, 10);
      durations = listDurationsBetween(state.db, user.id, startDay, today);
    }

    const days = dayRange(startDay, today);
    const byDay = new Map<string, number>();
    for (const dd of durations) byDay.set(dd.day, (byDay.get(dd.day) ?? 0) + dd.duration);
    const points = days.map((day) => ({ label: day, value: byDay.get(day) ?? 0 }));

    const agg = summarizeRange(durations);
    let best = { day: "—", seconds: 0 };
    for (const [day, seconds] of byDay) if (seconds > best.seconds) best = { day, seconds };
    const total = sumDuration(durations);

    const view: StatsView = {
      range,
      rangeLabel: startDay + " ~ " + today,
      totalText: buildTotal(total).text,
      dailyAverageText: buildTotal(days.length > 0 ? total / days.length : 0).text,
      bestDayText: best.day === "—" ? "—" : best.day + "（" + buildTotal(best.seconds).text + "）",
      points,
      projects: agg.projects,
      languages: agg.languages,
      branches: agg.branches,
      editors: agg.editors,
      categories: agg.categories,
    };
    html(ctx, 200, statsPage(user, view));
  });

  r.get("/settings", async (ctx) => {
    const user = guard(state, ctx);
    if (!user) return;
    const newKey = ctx.query.get("created");
    html(ctx, 200, settingsPage(user, listKeys(state.db, user.id), newKey));
  });

  r.post("/settings/keys", async (ctx) => {
    const user = guard(state, ctx);
    if (!user) return;
    const f = form(ctx);
    const name = (f.name ?? "").trim();
    if (name.length < 1 || name.length > 64) {
      html(ctx, 400, settingsPage(user, listKeys(state.db, user.id), null));
      return;
    }
    const generated = generateApiKey();
    const row = createKey(state.db, { userId: user.id, name, prefix: generated.prefix, keyHash: generated.hash });
    logAudit(state.db, { userId: user.id, action: "key.create", target: row.id, ip: ctx.ip, userAgent: ctx.userAgent });
    redirect(ctx, "/settings?created=" + encodeURIComponent(generated.key));
  });

  r.post("/settings/keys/:id/delete", async (ctx, params) => {
    const user = guard(state, ctx);
    if (!user) return;
    revokeKey(state.db, user.id, params.id);
    logAudit(state.db, { userId: user.id, action: "key.revoke", target: params.id, ip: ctx.ip, userAgent: ctx.userAgent });
    redirect(ctx, "/settings");
  });

  r.get("/admin/users", async (ctx) => {
    const user = requireAdminPage(state, ctx);
    if (!user) return;
    const { users } = listUsers(state.db, 1, 100);
    html(ctx, 200, adminUsersPage(user, users));
  });

  r.post("/admin/users", async (ctx) => {
    const user = requireAdminPage(state, ctx);
    if (!user) return;
    const f = form(ctx);
    const username = (f.username ?? "").trim();
    const password = f.password ?? "";
    const role = f.role === "admin" ? "admin" : "member";
    const timezone = (f.timezone ?? state.config.defaultTimezone).trim() || state.config.defaultTimezone;
    const { users } = listUsers(state.db, 1, 100);

    if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) {
      html(ctx, 400, adminUsersPage(user, users, "用户名需 3-32 位字母数字或 _ . -"));
      return;
    }
    const policyError = passwordPolicyError(password, username);
    if (policyError) {
      html(ctx, 400, adminUsersPage(user, users, policyError));
      return;
    }
    try {
      const created = createUser(state.db, { username, passwordHash: hashPassword(password), role, timezone });
      logAudit(state.db, { userId: user.id, action: "user.create", target: created.username, ip: ctx.ip, userAgent: ctx.userAgent });
    } catch {
      html(ctx, 409, adminUsersPage(user, users, "用户名已存在"));
      return;
    }
    redirect(ctx, "/admin/users");
  });

  r.post("/admin/users/:id/delete", async (ctx, params) => {
    const user = requireAdminPage(state, ctx);
    if (!user) return;
    if (params.id !== user.id) {
      const target = findUserById(state.db, params.id);
      if (target) {
        deleteUser(state.db, params.id);
        logAudit(state.db, { userId: user.id, action: "user.delete", target: target.username, ip: ctx.ip, userAgent: ctx.userAgent });
      }
    }
    redirect(ctx, "/admin/users");
  });

  r.get("/admin/audit", async (ctx) => {
    const user = requireAdminPage(state, ctx);
    if (!user) return;
    const page = Math.max(1, Number(ctx.query.get("page") ?? 1));
    const { entries, total } = listAudit(state.db, {}, page, 100);
    html(ctx, 200, auditPage(user, entries, total));
  });
}

