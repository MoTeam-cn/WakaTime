/**
 * 端到端冒烟测试：起真实 HTTP 服务 + 真实 SQLite，走完整用户旅程。
 * 运行：node --experimental-strip-types scripts/smoke.ts
 */
import http from "node:http";
import { buildState } from "../apps/server/src/main.ts";
import { createHttpServer } from "../apps/server/src/http/server.ts";

export interface SmokeResult {
  lines: string[];
  failures: string[];
}

export async function runSmoke(): Promise<SmokeResult> {
  const lines: string[] = [];
  const failures: string[] = [];
  const note = (s: string, okFlag: boolean) => {
    lines.push((okFlag ? "PASS " : "FAIL ") + s);
    if (!okFlag) failures.push(s);
  };

  const state = buildState();
  const srv = createHttpServer(state);
  await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", () => resolve()));
  const port = (srv.address() as { port: number }).port;
  const base = "http://127.0.0.1:" + port;

  async function req(
    method: string,
    path: string,
    opts: { body?: unknown; token?: string; form?: Record<string, string>; cookie?: string } = {}
  ) {
    const headers: Record<string, string> = { "user-agent": "vscode/1.90.0 vscode-wakatime/30.2.1" };
    let body: string | undefined;
    if (opts.form) {
      headers["content-type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(opts.form).toString();
    } else if (opts.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    if (opts.token) headers["authorization"] = opts.token;
    if (opts.cookie) headers["cookie"] = opts.cookie;
    const res = await fetch(base + path, { method, headers, body, redirect: "manual" });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    return { status: res.status, headers: res.headers, text, json: parsed as any };
  }

  try {
    let r = await req("GET", "/healthz");
    note("健康检查 200", r.status === 200 && r.json?.data?.status === "ok");

    r = await req("GET", "/");
    note("未初始化跳 /setup", r.status === 302 && r.headers.get("location") === "/setup");

    r = await req("POST", "/v1/setup", { body: { username: "xiaomo", password: "supersecret123", timezone: "Asia/Shanghai" } });
    note("初始化建管理员", r.status === 201 && r.json?.data?.user?.role === "admin");

    r = await req("POST", "/v1/setup", { body: { username: "hacker", password: "supersecret123" } });
    note("二次初始化被拒 409", r.status === 409 && r.json?.error === "setup_closed");

    r = await req("POST", "/v1/session", { body: { username: "xiaomo", password: "supersecret123" } });
    const access = r.json?.data?.access_token as string;
    const refresh = r.json?.data?.refresh_token as string;
    note("登录返回 JWT + refresh", r.status === 200 && typeof access === "string" && access.split(".").length === 3);

    r = await req("POST", "/v1/session", { body: { username: "xiaomo", password: "wrongpassword" } });
    note("错误密码 401", r.status === 401);

    r = await req("POST", "/v1/users/current/api_keys", { token: "Bearer " + access, body: { name: "desktop-vscode" } });
    const apiKey = r.json?.data?.key as string;
    note("创建 API Key", r.status === 201 && typeof apiKey === "string" && apiKey.startsWith("waka_"));

    const basic = "Basic " + Buffer.from(apiKey).toString("base64");
    const now = Math.floor(Date.now() / 1000);
    const hbs = [0, 120, 240, 360].map((d, i) => ({
      entity: "C:\\Users\\XiaoMo\\proj\\src\\main.ts",
      type: "file",
      category: "coding",
      time: now - 600 + d,
      project: "waka-selfhost",
      branch: "main",
      language: "typescript",
      lines: 100 + i,
      is_write: i === 3,
      machine_name_id: "mach-1",
    }));

    r = await req("POST", "/v1/users/current/heartbeats.bulk", { token: basic, body: hbs });
    note("批量上报 201", r.status === 201 && Array.isArray(r.json?.responses) && r.json.responses.length === 4);

    r = await req("POST", "/v1/users/current/heartbeats.bulk", { token: basic, body: hbs });
    const countRow = state.db.prepare("SELECT COUNT(*) AS c FROM heartbeats").get() as { c: number };
    note("重复上报去重（仍 4 条）", r.status === 201 && Number(countRow.c) === 4);

    r = await req("GET", "/v1/users/current/status_bar/today", { token: basic });
    const barTotal = r.json?.data?.grand_total?.total_seconds;
    note("状态栏今日时长 360 秒", r.status === 200 && barTotal === 360);
    note("状态栏语言归并为 TypeScript", r.json?.data?.languages?.[0]?.name === "TypeScript");

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
    r = await req("GET", "/v1/users/current/durations?date=" + today, { token: "Bearer " + access });
    note("durations 返回段与 timezone", r.status === 200 && Array.isArray(r.json?.data) && r.json.data.length === 1 && r.json.timezone === "Asia/Shanghai");

    r = await req("GET", "/v1/users/current/summaries?start=" + today + "&end=" + today, { token: "Bearer " + access });
    note("summaries 结构完整", r.status === 200 && Array.isArray(r.json?.data) && r.json?.cumulative_total?.total_seconds === 360);

    r = await req("GET", "/v1/users/current/stats/last_7_days", { token: "Bearer " + access });
    note("stats 返回总量与日均", r.status === 200 && typeof r.json?.data?.daily_average === "number");

    r = await req("GET", "/v1/users/current/all_time_since_today", { token: "Bearer " + access });
    note("all_time_since_today", r.status === 200 && r.json?.data?.total_seconds === 360);

    r = await req("GET", "/v1/plugins");
    note("plugins 端点", r.status === 200 && Array.isArray(r.json?.data));

    r = await req("GET", "/api/v1/plugins");
    note("/api/v1/plugins 兼容别名", r.status === 200);

    r = await req("GET", "/v1/users/current/goals", { token: "Bearer " + access });
    note("未实现端点 404 not_implemented", r.status === 404 && r.json?.error === "not_implemented");

    r = await req("GET", "/v1/users/current/summaries");
    note("无凭据 401", r.status === 401);

    r = await req("POST", "/v1/session/refresh", { body: { refresh_token: refresh } });
    const access2 = r.json?.data?.access_token as string;
    const refresh2 = r.json?.data?.refresh_token as string;
    note("refresh 旋转", r.status === 200 && access2 !== access && refresh2 !== refresh);

    r = await req("POST", "/v1/session/refresh", { body: { refresh_token: refresh } });
    note("旧 refresh 失效 401", r.status === 401);

    r = await req("POST", "/login", { form: { username: "xiaomo", password: "supersecret123" } });
    const setCookie = r.headers.get("set-cookie") ?? "";
    const cookie = setCookie.split(",").map((c) => c.split(";")[0].trim()).join("; ");
    note("网页登录下发 Cookie", r.status === 302 && cookie.includes("waka_at="));

    r = await req("GET", "/", { cookie });
    note("今日页渲染（含总时长）", r.status === 200 && r.text.includes("今日") && r.text.includes("min"));

    r = await req("GET", "/stats?range=7d", { cookie });
    note("统计页渲染 SVG", r.status === 200 && r.text.includes("<svg"));

    r = await req("GET", "/settings", { cookie });
    note("设置页显示已建 Key", r.status === 200 && r.text.includes("desktop-vscode"));

    r = await req("GET", "/admin/users", { cookie });
    note("管理页可访问", r.status === 200);

    r = await req("GET", "/admin/audit", { cookie });
    note("审计页含 login.ok", r.status === 200 && r.text.includes("login.ok"));

    r = await req("POST", "/v1/admin/users", { token: "Bearer " + access2, body: { username: "friend", password: "friendpass123", role: "member" } });
    note("管理员建号", r.status === 201);

    r = await req("POST", "/v1/session", { body: { username: "friend", password: "friendpass123" } });
    const friendToken = r.json?.data?.access_token as string;
    note("新用户可登录", r.status === 200 && typeof friendToken === "string");

    r = await req("GET", "/v1/admin/users", { token: "Bearer " + friendToken });
    note("普通用户访问管理 API 403", r.status === 403);

    r = await req("GET", "/v1/users/current/summaries", { token: "Bearer " + friendToken });
    note("新用户只看到自己的空数据", r.status === 200 && r.json?.cumulative_total?.total_seconds === 0);

    r = await req("GET", "/admin/users", { cookie });
    note("管理页显示两个用户", r.status === 200 && r.text.includes("friend") && r.text.includes("xiaomo"));
  } finally {
    await new Promise<void>((resolve) => srv.close(() => resolve()));
    state.db.close();
  }

  return { lines, failures };
}

const isMain = process.argv[1] !== undefined && process.argv[1].includes("smoke");
if (isMain) {
  process.env.DATA_DIR = process.env.DATA_DIR ?? ".tmp-smoke";
  process.env.DB_PATH = process.env.DB_PATH ?? ":memory:";
  process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "error";
  const result = await runSmoke();
  for (const line of result.lines) console.log(line);
  console.log("");
  console.log(result.failures.length === 0 ? "ALL PASS (" + result.lines.length + ")" : result.failures.length + " FAILED");
  process.exit(result.failures.length === 0 ? 0 : 1);
}

