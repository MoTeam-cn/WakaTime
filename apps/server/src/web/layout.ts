import type { User } from "../store/users.ts";

export function esc(input: unknown): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const CSS = [
  ":root{--bg:#fff;--fg:#000;--muted:#888;--line:#e5e5e5;--hover:#f5f5f5}",
  "@media (prefers-color-scheme:dark){:root{--bg:#000;--fg:#fff;--muted:#999;--line:#222;--hover:#111}}",
  "*{box-sizing:border-box}",
  "body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.6 system-ui,-apple-system,Segoe UI,Microsoft YaHei,sans-serif}",
  "a{color:var(--fg);text-decoration:none;border-bottom:1px solid var(--line)}",
  "a:hover{background:var(--hover)}",
  "header{border-bottom:1px solid var(--line);padding:16px 24px;display:flex;gap:24px;align-items:center;flex-wrap:wrap}",
  "header .brand{font-weight:600;letter-spacing:.02em}",
  "header nav{display:flex;gap:16px;flex-wrap:wrap}",
  "header nav a{border:0;padding:2px 0}",
  "header nav a.active{border-bottom:2px solid var(--fg)}",
  "header .spacer{flex:1}",
  "main{max-width:960px;margin:0 auto;padding:24px}",
  "h1{font-size:20px;font-weight:600;margin:0 0 16px}",
  "h2{font-size:15px;font-weight:600;margin:24px 0 8px;color:var(--fg)}",
  ".muted{color:var(--muted)}",
  ".num{font-variant-numeric:tabular-nums}",
  ".big{font-size:44px;font-weight:600;line-height:1.1;font-variant-numeric:tabular-nums}",
  ".grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:24px}",
  "table{width:100%;border-collapse:collapse}",
  "th,td{text-align:left;padding:8px 0;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}",
  "th{font-weight:600;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.06em}",
  "td.right,th.right{text-align:right}",
  "input,select,button{font:inherit;color:var(--fg);background:var(--bg);border:1px solid var(--fg);padding:6px 8px;border-radius:2px}",
  "button{cursor:pointer}",
  "button:hover{background:var(--fg);color:var(--bg)}",
  "form.inline{display:flex;gap:8px;flex-wrap:wrap;align-items:center}",
  ".card{border:1px solid var(--line);padding:16px}",
  ".bar{height:8px;background:var(--line)}",
  ".bar>span{display:block;height:100%;background:var(--fg)}",
  ".err{border:1px solid var(--fg);padding:8px 12px;margin:0 0 16px}",
  ".pill{border:1px solid var(--line);padding:1px 6px;font-size:12px;color:var(--muted)}",
  ".tabs{display:flex;gap:8px;margin-bottom:16px}",
  ".tabs a{border:1px solid var(--line);padding:2px 10px}",
  ".tabs a.active{background:var(--fg);color:var(--bg);border-color:var(--fg)}",
  "pre{margin:0;overflow:auto;font-size:12px}",
  "footer{max-width:960px;margin:48px auto 24px;padding:0 24px;color:var(--muted);font-size:12px}",
].join("\n");

export interface LayoutOptions {
  title: string;
  user?: Pick<User, "username" | "role"> | null;
  active?: string;
  error?: string | null;
  body: string;
  bare?: boolean;
}

export function layout(opts: LayoutOptions): string {
  const nav: string[] = [];
  if (opts.user && !opts.bare) {
    const items: { href: string; label: string; key: string }[] = [
      { href: "/", label: "今日", key: "today" },
      { href: "/stats", label: "统计", key: "stats" },
      { href: "/settings", label: "设置", key: "settings" },
    ];
    if (opts.user.role === "admin") {
      items.push({ href: "/admin/users", label: "用户", key: "users" });
      items.push({ href: "/admin/audit", label: "审计", key: "audit" });
    }
    for (const it of items) {
      nav.push("<a href=\"" + it.href + "\" class=\"" + (opts.active === it.key ? "active" : "") + "\">" + esc(it.label) + "</a>");
    }
  }

  const header = opts.bare
    ? "<header><span class=\"brand\">waka-selfhost</span></header>"
    : [
        "<header>",
        "<span class=\"brand\">waka-selfhost</span>",
        "<nav>" + nav.join("") + "</nav>",
        "<span class=\"spacer\"></span>",
        opts.user
          ? "<span class=\"muted\">" + esc(opts.user.username) + "</span><a href=\"/logout\">退出</a>"
          : "",
        "</header>",
      ].join("");

  return [
    "<!doctype html>",
    "<html lang=\"zh-CN\"><head>",
    "<meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
    "<title>" + esc(opts.title) + " · waka-selfhost</title>",
    "<style>" + CSS + "</style>",
    "</head><body>",
    header,
    "<main>",
    opts.error ? "<div class=\"err\">" + esc(opts.error) + "</div>" : "",
    opts.body,
    "</main>",
    "<footer>waka-selfhost · 自托管编码统计</footer>",
    "</body></html>",
  ].join("");
}

