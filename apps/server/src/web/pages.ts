import { esc, layout } from "./layout.ts";
import { barChart, rankList } from "./svg.ts";
import type { User } from "../store/users.ts";
import type { ApiKeyRow } from "../store/keys.ts";
import type { AuditEntry } from "../store/audit.ts";
import type { DaySummary, Duration, SummaryEntry } from "@waka/core";

export function setupPage(error?: string | null): string {
  return layout({
    title: "初始化",
    bare: true,
    error,
    body: [
      "<h1>初始化</h1>",
      "<p class=\"muted\">这是第一次启动。创建的管理员账号将拥有全部权限；系统不开放注册，之后的账号只能由管理员创建。</p>",
      "<form method=\"post\" action=\"/setup\" class=\"card\" style=\"max-width:420px\">",
      "<p><label>用户名<br><input name=\"username\" required minlength=\"3\" maxlength=\"32\" autofocus></label></p>",
      "<p><label>密码（至少 10 位）<br><input name=\"password\" type=\"password\" required minlength=\"10\"></label></p>",
      "<p><label>确认密码<br><input name=\"confirm\" type=\"password\" required minlength=\"10\"></label></p>",
      "<p><label>时区<br><input name=\"timezone\" value=\"Asia/Shanghai\" required></label></p>",
      "<p><button type=\"submit\">创建管理员并开始</button></p>",
      "</form>",
    ].join(""),
  });
}

export function loginPage(error?: string | null): string {
  return layout({
    title: "登录",
    bare: true,
    error,
    body: [
      "<h1>登录</h1>",
      "<form method=\"post\" action=\"/login\" class=\"card\" style=\"max-width:360px\">",
      "<p><label>用户名<br><input name=\"username\" required autofocus></label></p>",
      "<p><label>密码<br><input name=\"password\" type=\"password\" required></label></p>",
      "<p><button type=\"submit\">登录</button></p>",
      "</form>",
    ].join(""),
  });
}

function entryTable(entries: SummaryEntry[], emptyText: string): string {
  return rankList(
    entries.map((e) => ({ name: e.name, text: e.text, percent: e.percent })),
    emptyText
  );
}

export function todayPage(user: User, summary: DaySummary, recent: Duration[]): string {
  const rows = recent.slice(0, 20).map((d) => {
    const start = new Date(d.startTime * 1000).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: user.timezone });
    const mins = Math.round(d.duration / 60);
    return [
      "<tr>",
      "<td class=\"num muted\">" + esc(start) + "</td>",
      "<td>" + esc(d.project ?? "—") + "</td>",
      "<td>" + esc(d.language ?? "—") + "</td>",
      "<td class=\"muted\" style=\"max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\">" + esc(d.entity) + "</td>",
      "<td class=\"right num\">" + mins + " min</td>",
      "</tr>",
    ].join("");
  });

  const body = [
    "<h1>今日</h1>",
    "<div class=\"big\">" + esc(summary.grandTotal.text) + "</div>",
    "<p class=\"muted\">" + esc(summary.date) + " · " + esc(user.timezone) + " · 总 " + summary.grandTotal.total_seconds + " 秒</p>",
    "<h2>分类</h2>",
    entryTable(summary.categories, "今天还没有记录"),
    "<div class=\"grid\">",
    "<div><h2>项目</h2>" + entryTable(summary.projects, "—") + "</div>",
    "<div><h2>语言</h2>" + entryTable(summary.languages, "—") + "</div>",
    "</div>",
    "<div class=\"grid\">",
    "<div><h2>编辑器</h2>" + entryTable(summary.editors, "—") + "</div>",
    "<div><h2>分支</h2>" + entryTable(summary.branches, "—") + "</div>",
    "</div>",
    "<h2>最近活动</h2>",
    recent.length === 0
      ? "<p class=\"muted\">暂无活动。配置插件后这里会显示实时记录。</p>"
      : "<table><thead><tr><th>开始</th><th>项目</th><th>语言</th><th>文件</th><th class=\"right\">时长</th></tr></thead><tbody>" + rows.join("") + "</tbody></table>",
    "<p class=\"muted\" style=\"margin-top:24px\">说明：语言榜只统计有语言标记的活动，所以各语言时长之和通常小于总时长（终端、浏览器等活动没有语言）。</p>",
  ].join("");

  return layout({ title: "今日", user, active: "today", body });
}

export interface StatsView {
  range: string;
  rangeLabel: string;
  totalText: string;
  dailyAverageText: string;
  bestDayText: string;
  points: { label: string; value: number }[];
  projects: SummaryEntry[];
  languages: SummaryEntry[];
  branches: SummaryEntry[];
  editors: SummaryEntry[];
  categories: SummaryEntry[];
}

export function statsPage(user: User, view: StatsView): string {
  const tabs = [
    { key: "7d", label: "近 7 天" },
    { key: "30d", label: "近 30 天" },
    { key: "all", label: "全部" },
  ]
    .map((t) => "<a href=\"/stats?range=" + t.key + "\" class=\"" + (view.range === t.key ? "active" : "") + "\">" + esc(t.label) + "</a>")
    .join("");

  const body = [
    "<h1>统计</h1>",
    "<div class=\"tabs\">" + tabs + "</div>",
    "<div class=\"big\">" + esc(view.totalText) + "</div>",
    "<p class=\"muted\">" + esc(view.rangeLabel) + " · 日均 " + esc(view.dailyAverageText) + " · 最佳 " + esc(view.bestDayText) + "</p>",
    "<h2>趋势</h2>",
    barChart(view.points),
    "<div class=\"grid\">",
    "<div><h2>项目</h2>" + entryTable(view.projects, "—") + "</div>",
    "<div><h2>语言</h2>" + entryTable(view.languages, "—") + "</div>",
    "</div>",
    "<div class=\"grid\">",
    "<div><h2>分类</h2>" + entryTable(view.categories, "—") + "</div>",
    "<div><h2>编辑器</h2>" + entryTable(view.editors, "—") + "</div>",
    "</div>",
    "<h2>分支</h2>",
    entryTable(view.branches, "—"),
  ].join("");

  return layout({ title: "统计", user, active: "stats", body });
}

export function settingsPage(user: User, keys: ApiKeyRow[], newKey: string | null): string {
  const keyRows = keys.map((k) => {
    const created = new Date(k.createdAt * 1000).toISOString().slice(0, 10);
    const used = k.lastUsedAt ? new Date(k.lastUsedAt * 1000).toISOString().slice(0, 16).replace("T", " ") : "从未";
    return [
      "<tr>",
      "<td>" + esc(k.name) + "</td>",
      "<td class=\"num muted\">" + esc(k.prefix) + "…</td>",
      "<td class=\"muted\">" + esc(created) + "</td>",
      "<td class=\"muted\">" + esc(used) + "</td>",
      "<td class=\"right\">",
      k.revokedAt !== null
        ? "<span class=\"pill\">已吊销</span>"
        : "<form method=\"post\" action=\"/settings/keys/" + esc(k.id) + "/delete\" class=\"inline\"><button type=\"submit\">吊销</button></form>",
      "</td>",
      "</tr>",
    ].join("");
  });

  const body = [
    "<h1>设置</h1>",
    newKey
      ? "<div class=\"card\"><p><strong>新密钥（只显示这一次，请立即复制）：</strong></p><pre>" + esc(newKey) + "</pre></div>"
      : "",
    "<h2>账号</h2>",
    "<table><tbody>",
    "<tr><td>用户名</td><td class=\"num\">" + esc(user.username) + "</td></tr>",
    "<tr><td>角色</td><td class=\"num\">" + esc(user.role) + "</td></tr>",
    "<tr><td>时区</td><td class=\"num\">" + esc(user.timezone) + "</td></tr>",
    "</tbody></table>",
    "<h2>API Key</h2>",
    "<p class=\"muted\">插件用它上报（作为 WakaTime 的 apiKey 填入）。每台机器建议单独建一个，泄露时只吊销那一个。</p>",
    keys.length === 0
      ? "<p class=\"muted\">还没有密钥。</p>"
      : "<table><thead><tr><th>名称</th><th>前缀</th><th>创建</th><th>最近使用</th><th></th></tr></thead><tbody>" + keyRows.join("") + "</tbody></table>",
    "<form method=\"post\" action=\"/settings/keys\" class=\"inline\" style=\"margin-top:12px\">",
    "<input name=\"name\" placeholder=\"例如 desktop-vscode\" required maxlength=\"64\">",
    "<button type=\"submit\">新建密钥</button>",
    "</form>",
    "<h2>插件配置</h2>",
    "<p class=\"muted\">VS Code 官方插件 settings.json：</p>",
    "<pre>{\n  \"wakatime.apiKey\": \"waka_xxx\",\n  \"wakatime.apiUrl\": \"http://localhost:8800/v1\"\n}</pre>",
  ].join("");

  return layout({ title: "设置", user, active: "settings", body });
}

export function adminUsersPage(user: User, users: User[], error?: string | null): string {
  const rows = users.map((u) => {
    const created = new Date(u.createdAt * 1000).toISOString().slice(0, 10);
    return [
      "<tr>",
      "<td>" + esc(u.username) + (u.disabled ? " <span class=\"pill\">已禁用</span>" : "") + "</td>",
      "<td class=\"num\">" + esc(u.role) + "</td>",
      "<td class=\"num muted\">" + esc(u.timezone) + "</td>",
      "<td class=\"muted\">" + esc(created) + "</td>",
      "<td class=\"right\">",
      u.id === user.id
        ? "<span class=\"muted\">当前账号</span>"
        : "<form method=\"post\" action=\"/admin/users/" + esc(u.id) + "/delete\" class=\"inline\"><button type=\"submit\">删除</button></form>",
      "</td>",
      "</tr>",
    ].join("");
  });

  const body = [
    "<h1>用户</h1>",
    "<p class=\"muted\">系统不开放注册，只能在这里创建账号。</p>",
    "<table><thead><tr><th>用户名</th><th>角色</th><th>时区</th><th>创建</th><th></th></tr></thead><tbody>" + rows.join("") + "</tbody></table>",
    "<h2>新建用户</h2>",
    "<form method=\"post\" action=\"/admin/users\" class=\"inline\">",
    "<input name=\"username\" placeholder=\"用户名\" required minlength=\"3\" maxlength=\"32\">",
    "<input name=\"password\" type=\"password\" placeholder=\"密码（至少 10 位）\" required minlength=\"10\">",
    "<select name=\"role\"><option value=\"member\">member</option><option value=\"admin\">admin</option></select>",
    "<input name=\"timezone\" value=\"Asia/Shanghai\" size=\"16\">",
    "<button type=\"submit\">创建</button>",
    "</form>",
  ].join("");

  return layout({ title: "用户", user, active: "users", error, body });
}

export function auditPage(user: User, entries: AuditEntry[], total: number): string {
  const rows = entries.map((e) => {
    const when = new Date(e.createdAt * 1000).toISOString().replace("T", " ").slice(0, 19);
    return [
      "<tr>",
      "<td class=\"num muted\">" + esc(when) + "</td>",
      "<td class=\"num\">" + esc(e.action) + "</td>",
      "<td>" + esc(e.target ?? "—") + "</td>",
      "<td class=\"muted num\">" + esc(e.ip ?? "—") + "</td>",
      "</tr>",
    ].join("");
  });

  const body = [
    "<h1>审计日志</h1>",
    "<p class=\"muted\">共 " + total + " 条（仅记录账号与密钥相关操作，不记录心跳）</p>",
    "<table><thead><tr><th>时间</th><th>动作</th><th>对象</th><th>IP</th></tr></thead><tbody>" + rows.join("") + "</tbody></table>",
  ].join("");

  return layout({ title: "审计", user, active: "audit", body });
}

export function errorPage(user: User | null, message: string): string {
  return layout({
    title: "出错了",
    user,
    error: message,
    body: "<h1>出错了</h1><p><a href=\"/\">返回首页</a></p>",
  });
}

