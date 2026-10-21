import type { Duration, DaySummary, SummaryEntry, TimeTotal } from "./types.ts";
import { buildTotal, buildEntry } from "./format.ts";

export type Dimension =
  | "project"
  | "branch"
  | "language"
  | "category"
  | "entity"
  | "editor"
  | "os"
  | "machine";

function pick(d: Duration, dim: Dimension): string {
  switch (dim) {
    case "project":
      return d.project ?? "Unknown Project";
    case "branch":
      return d.branch ?? "Unknown Branch";
    case "language":
      return d.language ?? "Other";
    case "category":
      return d.category;
    case "entity":
      return d.entity;
    case "editor":
      return d.editor ?? "Unknown Editor";
    case "os":
      return d.os ?? "Unknown OS";
    case "machine":
      return d.machineNameId ?? "Unknown Machine";
    default:
      return "Other";
  }
}

/** 按维度求和，降序排列，percent 基于 grandTotal */
export function groupTotals(
  durations: Duration[],
  dim: Dimension,
  grandTotal: number,
  filter?: (d: Duration) => boolean
): SummaryEntry[] {
  const acc = new Map<string, number>();
  for (const d of durations) {
    if (filter && !filter(d)) continue;
    const key = pick(d, dim);
    acc.set(key, (acc.get(key) ?? 0) + d.duration);
  }
  const entries: SummaryEntry[] = [];
  for (const [name, seconds] of acc) {
    if (seconds <= 0) continue;
    entries.push(buildEntry(name, seconds, grandTotal));
  }
  entries.sort((a, b) => b.total_seconds - a.total_seconds || a.name.localeCompare(b.name));
  return entries;
}

export function sumDuration(durations: Duration[]): number {
  let t = 0;
  for (const d of durations) t += d.duration;
  return t;
}

/** 只统计有语言的活动（语言榜专用，用于解释语言总和与总时长的差额） */
export function sumWithLanguage(durations: Duration[]): number {
  let t = 0;
  for (const d of durations) if (d.language) t += d.duration;
  return t;
}

/** 一天的汇总 */
export function summarizeDay(date: string, durations: Duration[]): DaySummary {
  const grand = sumDuration(durations);
  return {
    date,
    grandTotal: buildTotal(grand),
    categories: groupTotals(durations, "category", grand),
    projects: groupTotals(durations, "project", grand),
    languages: groupTotals(durations, "language", grand, (d) => d.language !== null),
    editors: groupTotals(durations, "editor", grand),
    operatingSystems: groupTotals(durations, "os", grand),
    machines: groupTotals(durations, "machine", grand),
    branches: groupTotals(durations, "branch", grand, (d) => d.branch !== null),
    dependencies: [],
    entities: groupTotals(durations, "entity", grand),
  };
}

/** 区间汇总：把每天的结果按维度再合并 */
export function summarizeRange(durations: Duration[]): {
  grandTotal: TimeTotal;
  categories: SummaryEntry[];
  projects: SummaryEntry[];
  languages: SummaryEntry[];
  editors: SummaryEntry[];
  operatingSystems: SummaryEntry[];
  machines: SummaryEntry[];
  branches: SummaryEntry[];
} {
  const grand = sumDuration(durations);
  return {
    grandTotal: buildTotal(grand),
    categories: groupTotals(durations, "category", grand),
    projects: groupTotals(durations, "project", grand),
    languages: groupTotals(durations, "language", grand, (d) => d.language !== null),
    editors: groupTotals(durations, "editor", grand),
    operatingSystems: groupTotals(durations, "os", grand),
    machines: groupTotals(durations, "machine", grand),
    branches: groupTotals(durations, "branch", grand, (d) => d.branch !== null),
  };
}

