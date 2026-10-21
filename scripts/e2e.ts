/**
 * 真实进程端到端：spawn 编译产物 apps/server/dist/main.js，用 fetch 走完整链路。
 * 前置：npx tsc -b
 * 运行：node --experimental-strip-types scripts/e2e.ts
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const PORT = String(8800 + Math.floor(Math.random() * 90));
const DATA_DIR = path.resolve(".tmp-e2e");
const base = "http://127.0.0.1:" + PORT;

const lines: string[] = [];
const failures: string[] = [];
function check(name: string, cond: boolean, extra = ""): void {
  lines.push((cond ? "PASS " : "FAIL ") + name + (cond ? "" : " " + extra));
  if (!cond) failures.push(name);
}

async function main(): Promise<void> {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  const entry = path.resolve("apps/server/dist/main.js");
  if (!fs.existsSync(entry)) {
    console.error("缺少编译产物，请先运行 npx tsc -b");
    process.exit(2);
  }

  const child = spawn(process.execPath, [entry], {
    env: { ...process.env, PORT, DATA_DIR, LOG_LEVEL: "error", TZ: "Asia/Shanghai", JWT_SECRET: "e2e-secret" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += String(d)));
  child.stderr.on("data", (d) => (log += String(d)));

  let ready = false;
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const res = await fetch(base + "/healthz");
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      /* 等待启动 */
    }
  }
  if (!ready) {
    child.kill();
    console.error("服务未启动：\n" + log.slice(0, 1200));
    process.exit(1);
  }

  async function call(
    method: string,
    url: string,
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
    const res = await fetch(base + url, { method, headers, body, redirect: "manual" });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: res.status, headers: res.headers, text, json: json as any };
  }

  try {
    let r = await call("GET", "/healthz");
    check("健康检查", r.status === 200 && r.json?.data?.status === "ok");
    r = await call("GET", "/");
    check("未初始化跳 /setup", r.status === 302 && r.headers.get("location") === "/setup");
    r = await call("POST", "/v1/setup", { body: { username: "xiaomo", password: "supersecret123", timezone: "Asia/Shanghai" } });
    check("初始化", r.status === 201);
    r = await call("POST", "/v1/session", { body: { username: "xiaomo", password: "supersecret123" } });
    const access = r.json?.data?.access_token as string;
    check("登录", r.status === 200 && typeof access === "string");
    r = await call("POST", "/v1/users/current/api_keys", { token: "Bearer " + access, body: { name: "e2e" } });
    const apiKey = r.json?.data?.key as string;
    check("建 API Key", r.status === 201 && apiKey.startsWith("waka_"));

    const basic = "Basic " + Buffer.from(apiKey, "utf8").toString("base64");
    const now = Math.floor(Date.now() / 1000);
    r = await call("POST", "/v1/users/current/heartbeats.bulk", {
      token: basic,
      body: [0, 120, 240, 360].map((d, i) => ({
        entity: "/p/src/main.ts",
        type: "file",
        time: now - 900 + d,
        project: "demo",
        branch: "main",
        language: "typescript",
        is_write: i === 3,
      })),
    });
    check("上报 4 条", r.status === 201 && r.json?.responses?.length === 4);

    r = await call("GET", "/v1/users/current/status_bar/today", { token: basic });
    check("状态栏 360 秒", r.json?.data?.grand_total?.total_seconds === 360, JSON.stringify(r.json?.data?.grand_total));
    check("语言归一为 TypeScript", r.json?.data?.languages?.[0]?.name === "TypeScript");

    r = await call("GET", "/v1/users/current/summaries", { token: "Bearer " + access });
    check("summaries 累计 360", r.json?.cumulative_total?.total_seconds === 360, JSON.stringify(r.json?.cumulative_total));

    r = await call("POST", "/login", { form: { username: "xiaomo", password: "supersecret123" } });
    const cookie = (r.headers.get("set-cookie") ?? "")
      .split(",")
      .map((c) => c.split(";")[0].trim())
      .join("; ");
    check("网页登录下发 Cookie", cookie.includes("waka_at="));

    r = await call("GET", "/", { cookie });
    check("今日页含数据", r.status === 200 && r.text.includes("TypeScript"));
    r = await call("GET", "/stats?range=7d", { cookie });
    check("统计页含 SVG", r.status === 200 && r.text.includes("<svg"));
    r = await call("GET", "/settings", { cookie });
    check("设置页可用", r.status === 200 && r.text.includes("e2e"));
    r = await call("GET", "/admin/users", { cookie });
    check("管理页可用", r.status === 200);

    check("SQLite 落盘", fs.existsSync(path.join(DATA_DIR, "waka.db")));
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 300));
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }

  for (const line of lines) console.log(line);
  console.log("");
  console.log(failures.length === 0 ? "E2E ALL PASS (" + lines.length + ")" : failures.length + " E2E FAILED");
  process.exit(failures.length === 0 ? 0 : 1);
}

await main();

