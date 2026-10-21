/**
 * 口径对比：拿官方 summaries 导出与本服务端 summaries 逐日比对。
 * 用法：node --experimental-strip-types scripts/compare.ts official.json local.json
 * 两份文件都可以是 WakaTime 的 summaries 响应（含 data 数组）。
 */
import fs from "node:fs";

interface DayLike {
  range?: { date?: string };
  grand_total?: { total_seconds?: number; text?: string };
  languages?: { name: string; total_seconds: number }[];
}

function loadDays(file: string): Map<string, DayLike> {
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  const arr = Array.isArray(raw) ? raw : ((raw as { data?: DayLike[] }).data ?? []);
  const map = new Map<string, DayLike>();
  for (const d of arr as DayLike[]) {
    const date = d.range?.date;
    if (date) map.set(date, d);
  }
  return map;
}

function fmt(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h + "h" + String(m).padStart(2, "0") + "m";
}

function main(): void {
  const [, , officialPath, localPath] = process.argv;
  if (!officialPath || !localPath) {
    console.error("用法: node --experimental-strip-types scripts/compare.ts <official.json> <local.json>");
    process.exit(2);
  }
  const official = loadDays(officialPath);
  const local = loadDays(localPath);
  const dates = [...new Set([...official.keys(), ...local.keys()])].sort();

  console.log(["日期", "官方", "本地", "差值", "偏差率"].join("\t"));
  let totalOfficial = 0;
  let totalLocal = 0;
  for (const date of dates) {
    const o = official.get(date)?.grand_total?.total_seconds ?? 0;
    const l = local.get(date)?.grand_total?.total_seconds ?? 0;
    totalOfficial += o;
    totalLocal += l;
    const diff = l - o;
    const rate = o > 0 ? ((diff / o) * 100).toFixed(2) + "%" : "n/a";
    console.log([date, fmt(o), fmt(l), (diff >= 0 ? "+" : "") + Math.round(diff) + "s", rate].join("\t"));
  }
  const totalDiff = totalLocal - totalOfficial;
  const totalRate = totalOfficial > 0 ? ((totalDiff / totalOfficial) * 100).toFixed(2) + "%" : "n/a";
  console.log("");
  console.log("合计\t" + fmt(totalOfficial) + "\t" + fmt(totalLocal) + "\t" + (totalDiff >= 0 ? "+" : "") + Math.round(totalDiff) + "s\t" + totalRate);
  console.log("偏差率在 ±5% 内视为口径基本一致；超过需检查心跳节流与超时常量。");
}

main();

