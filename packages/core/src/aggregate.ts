import type { Heartbeat, Duration } from "./types.ts";

export interface AggregateOptions {
  /** 相邻心跳超过该秒数即断开（默认 900 = 15 分钟，WakaTime 口径） */
  timeout?: number;
  /** 单次间隔上限，0 表示不封顶 */
  maxGap?: number;
  /** IANA 时区，决定日界 */
  timezone?: string;
  /** 是否把 entity 纳入分组键（文件级统计用，会显著增加段数） */
  includeEntity?: boolean;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** epoch 秒 → 指定时区下的 YYYY-MM-DD */
export function localDay(epochSeconds: number, timeZone: string): string {
  const parts = getFormatter(timeZone).formatToParts(new Date(epochSeconds * 1000));
  let y = "1970",
    m = "01",
    d = "01";
  for (const p of parts) {
    if (p.type === "year") y = p.value;
    else if (p.type === "month") m = p.value;
    else if (p.type === "day") d = p.value;
  }
  return y + "-" + m + "-" + d;
}

/** 分组键：project|branch|language|category（可选 entity） */
export function groupKey(hb: Heartbeat, includeEntity: boolean): string {
  const parts = [hb.project ?? "", hb.branch ?? "", hb.language ?? "", hb.category];
  if (includeEntity) parts.push(hb.entity);
  return parts.join("|");
}

interface Bucket {
  dur: Duration;
  weights: Map<string, number>;
  lastEntity: string;
  lastTime: number;
  key: string;
}

function newBucket(hb: Heartbeat, day: string, key: string): Bucket {
  return {
    dur: {
      startTime: hb.time,
      endTime: hb.time,
      duration: 0,
      project: hb.project,
      branch: hb.branch,
      language: hb.language,
      category: hb.category,
      entity: hb.entity,
      isWrite: hb.isWrite,
      numHeartbeats: 1,
      machineNameId: hb.machineNameId,
      editor: hb.editor,
      os: hb.os,
      day,
    },
    weights: new Map([[hb.entity, 0]]),
    lastEntity: hb.entity,
    lastTime: hb.time,
    key,
  };
}

/**
 * 心跳 → 时长。
 * 规则：按 (project, branch, language, category) 分组；相邻间隔 < timeout 则累加到当前段；
 * 跨天、跨组、超时都会切段。单条心跳时长为 0。
 */
export function aggregate(heartbeats: Heartbeat[], opts: AggregateOptions = {}): Duration[] {
  const timeout = opts.timeout ?? 900;
  const maxGap = opts.maxGap ?? 0;
  const tz = opts.timezone ?? "UTC";
  const includeEntity = opts.includeEntity ?? false;

  const sorted = heartbeats.slice().sort((a, b) => a.time - b.time);
  const buckets: Bucket[] = [];
  let cur: Bucket | null = null;

  for (const hb of sorted) {
    const day = localDay(hb.time, tz);
    const key = groupKey(hb, includeEntity);

    if (cur === null) {
      cur = newBucket(hb, day, key);
      buckets.push(cur);
      continue;
    }

    let gap = hb.time - cur.lastTime;
    if (gap < 0) gap = 0;
    const rawGap = gap;
    if (maxGap > 0 && gap > maxGap) gap = maxGap;

    if (rawGap >= timeout || key !== cur.key || day !== cur.dur.day) {
      cur = newBucket(hb, day, key);
      buckets.push(cur);
      continue;
    }

    cur.dur.duration += gap;
    cur.dur.endTime = hb.time;
    cur.dur.numHeartbeats += 1;
    cur.dur.isWrite = cur.dur.isWrite || hb.isWrite;
    cur.weights.set(cur.lastEntity, (cur.weights.get(cur.lastEntity) ?? 0) + gap);
    cur.lastEntity = hb.entity;
    cur.lastTime = hb.time;
  }

  // 段内保留停留最久的 entity（文件级统计的启发式）
  for (const b of buckets) {
    let best = b.dur.entity;
    let bestWeight = -1;
    for (const [entity, weight] of b.weights) {
      if (weight > bestWeight) {
        best = entity;
        bestWeight = weight;
      }
    }
    b.dur.entity = best;
  }

  return buckets.map((b) => b.dur);
}

/** 合并相邻同组、时间相接的时长段（读缓存时用） */
export function mergeDurations(list: Duration[]): Duration[] {
  const sorted = list.slice().sort((a, b) => a.startTime - b.startTime);
  const out: Duration[] = [];
  for (const d of sorted) {
    const prev = out.length > 0 ? out[out.length - 1] : undefined;
    if (
      prev &&
      prev.day === d.day &&
      prev.project === d.project &&
      prev.branch === d.branch &&
      prev.language === d.language &&
      prev.category === d.category &&
      prev.startTime + prev.duration >= d.startTime - 1
    ) {
      prev.duration = Math.max(prev.duration, d.startTime + d.duration - prev.startTime);
      prev.endTime = Math.max(prev.endTime, d.endTime);
      prev.numHeartbeats += d.numHeartbeats;
      prev.isWrite = prev.isWrite || d.isWrite;
      continue;
    }
    out.push({ ...d });
  }
  return out;
}

