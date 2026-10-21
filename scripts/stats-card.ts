/**
 * 生成黑白统计卡片 SVG（供 GitHub Action 每日提交到 README）。
 * 服务端不可达时静默跳过，不阻断 workflow。
 * 环境变量：WAKA_API_URL、WAKA_API_KEY
 */
import fs from "node:fs";
import path from "node:path";

interface Entry { name: string; text: string; percent: number; total_seconds: number }
interface SummaryDay { grand_total: { text: string; total_seconds: number }; languages: Entry[]; projects: Entry[] }

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function isoDay(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const apiUrl = (process.env.WAKA_API_URL ?? "").replace(/\/$/, "");
  const apiKey = process.env.WAKA_API_KEY ?? "";
  if (!apiUrl || !apiKey) {
    console.log("WAKA_API_URL / WAKA_API_KEY 未配置，跳过卡片生成");
    return;
  }

  const start = isoDay(-6);
  const end = isoDay(0);
  let days: SummaryDay[] = [];
  try {
    const res = await fetch(apiUrl + "/users/current/summaries?start=" + start + "&end=" + end, {
      headers: { authorization: "Basic " + Buffer.from(apiKey, "utf8").toString("base64") },
    });
    if (!res.ok) {
      console.log("服务端返回 " + res.status + "，跳过卡片生成");
      return;
    }
    const payload = (await res.json()) as { data?: SummaryDay[] };
    days = payload.data ?? [];
  } catch (err) {
    console.log("无法连接服务端，跳过卡片生成：" + String(err));
    return;
  }

  const total = days.reduce((acc, d) => acc + (d.grand_total?.total_seconds ?? 0), 0);
  const langMap = new Map<string, number>();
  for (const d of days) for (const l of d.languages ?? []) langMap.set(l.name, (langMap.get(l.name) ?? 0) + l.total_seconds);
  const languages = [...langMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const totalText = hours > 0 ? hours + " hrs " + mins + " mins" : mins + " mins";

  const rows = languages
    .map(([name, secs], i) => {
      const pct = total > 0 ? (secs / total) * 100 : 0;
      const y = 78 + i * 22;
      return [
        "<text x=\"16\" y=\"" + y + "\" font-size=\"12\" fill=\"#000\">" + esc(name) + "</text>",
        "<rect x=\"140\" y=\"" + (y - 9) + "\" width=\"" + Math.max(0, (pct / 100) * 180).toFixed(1) + "\" height=\"8\" fill=\"#000\"/>",
        "<text x=\"330\" y=\"" + y + "\" font-size=\"12\" fill=\"#666\" text-anchor=\"end\">" + pct.toFixed(1) + "%</text>",
      ].join("");
    })
    .join("");

  const height = Math.max(120, 92 + languages.length * 22);
  const svg = [
    "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"360\" height=\"" + height + "\" viewBox=\"0 0 360 " + height + "\" role=\"img\" aria-label=\"WakaTime 统计\">",
    "<rect width=\"360\" height=\"" + height + "\" fill=\"#fff\" stroke=\"#000\"/>",
    "<text x=\"16\" y=\"30\" font-size=\"13\" font-family=\"system-ui,sans-serif\" fill=\"#000\">近 7 天编码时长</text>",
    "<text x=\"16\" y=\"56\" font-size=\"20\" font-weight=\"600\" font-family=\"system-ui,sans-serif\" fill=\"#000\">" + esc(totalText) + "</text>",
    "<line x1=\"16\" y1=\"64\" x2=\"344\" y2=\"64\" stroke=\"#e5e5e5\"/>",
    "<g font-family=\"system-ui,sans-serif\">" + rows + "</g>",
    "<text x=\"344\" y=\"" + (height - 10) + "\" font-size=\"10\" fill=\"#888\" text-anchor=\"end\">" + start + " ~ " + end + "</text>",
    "</svg>",
  ].join("");

  const outDir = path.resolve("assets");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "wakatime-card.svg"), svg, "utf8");
  console.log("已写入 assets/wakatime-card.svg（总计 " + totalText + "）");
}

await main();

