import type { TimeTotal, SummaryEntry } from "./types.ts";

/** 把秒数拆成 时/分/秒（向下取整） */
export function splitSeconds(totalSeconds: number): { hours: number; minutes: number; seconds: number } {
  const s = Math.max(0, Math.floor(totalSeconds));
  return {
    hours: Math.floor(s / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

/** 人类可读时长：1 hr 30 mins / 45 secs / 2 hrs */
export function formatText(totalSeconds: number): string {
  const { hours, minutes, seconds } = splitSeconds(totalSeconds);
  const parts: string[] = [];
  if (hours > 0) parts.push(hours + (hours === 1 ? " hr" : " hrs"));
  if (minutes > 0) parts.push(minutes + (minutes === 1 ? " min" : " mins"));
  if (hours === 0 && minutes === 0) parts.push(seconds + (seconds === 1 ? " sec" : " secs"));
  return parts.join(" ");
}

/** 数字表：1:30 / 0:45 / 12:05 */
export function formatDigital(totalSeconds: number): string {
  const { hours, minutes } = splitSeconds(totalSeconds);
  return hours + ":" + String(minutes).padStart(2, "0");
}

/** 小数小时：1.50 */
export function formatDecimal(totalSeconds: number): string {
  return (Math.max(0, totalSeconds) / 3600).toFixed(2);
}

export function buildTotal(totalSeconds: number): TimeTotal {
  const { hours, minutes } = splitSeconds(totalSeconds);
  return {
    total_seconds: Math.max(0, Math.round(totalSeconds * 100) / 100),
    hours,
    minutes,
    text: formatText(totalSeconds),
    digital: formatDigital(totalSeconds),
    decimal: formatDecimal(totalSeconds),
  };
}

export function buildEntry(name: string, totalSeconds: number, grandTotal: number): SummaryEntry {
  const t = buildTotal(totalSeconds);
  const percent = grandTotal > 0 ? Math.round((totalSeconds / grandTotal) * 10000) / 100 : 0;
  return {
    name,
    total_seconds: t.total_seconds,
    text: t.text,
    hours: t.hours,
    minutes: t.minutes,
    digital: t.digital,
    decimal: t.decimal,
    percent,
  };
}

