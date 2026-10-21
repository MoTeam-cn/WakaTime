import test from "node:test";
import assert from "node:assert/strict";
import { aggregate, localDay, mergeDurations } from "../src/aggregate.ts";
import { hb, T0 } from "./helpers.ts";

test("单条心跳时长为 0", () => {
  const out = aggregate([hb({ time: T0 })], { timezone: "Asia/Shanghai" });
  assert.equal(out.length, 1);
  assert.equal(out[0].duration, 0);
  assert.equal(out[0].numHeartbeats, 1);
});

test("同组相邻心跳累加间隔", () => {
  const list = [0, 120, 240, 360, 480].map((d) => hb({ time: T0 + d }));
  const out = aggregate(list, { timezone: "Asia/Shanghai" });
  assert.equal(out.length, 1);
  assert.equal(out[0].duration, 480);
  assert.equal(out[0].numHeartbeats, 5);
});

test("超过 timeout 断开", () => {
  const out = aggregate([hb({ time: T0 }), hb({ time: T0 + 901 })], { timeout: 900, timezone: "Asia/Shanghai" });
  assert.equal(out.length, 2);
  assert.equal(out[0].duration, 0);
  assert.equal(out[1].duration, 0);
});

test("语言切换立即切分", () => {
  const out = aggregate(
    [hb({ time: T0, language: "TypeScript" }), hb({ time: T0 + 60, language: "TypeScript" }), hb({ time: T0 + 120, language: "Vue.js" })],
    { timezone: "Asia/Shanghai" }
  );
  assert.equal(out.length, 2);
  assert.equal(out[0].language, "TypeScript");
  assert.equal(out[0].duration, 60);
  assert.equal(out[1].language, "Vue.js");
  assert.equal(out[1].duration, 0);
});

test("跨天切分", () => {
  const a = Date.UTC(2026, 9, 20, 15, 59, 0) / 1000;
  const b = Date.UTC(2026, 9, 20, 16, 1, 0) / 1000;
  const out = aggregate([hb({ time: a }), hb({ time: b })], { timezone: "Asia/Shanghai" });
  assert.equal(out.length, 2);
  assert.equal(out[0].day, "2026-10-20");
  assert.equal(out[1].day, "2026-10-21");
});

test("乱序输入按时间排序后计算", () => {
  const out = aggregate([hb({ time: T0 + 120 }), hb({ time: T0 }), hb({ time: T0 + 60 })], { timezone: "Asia/Shanghai" });
  assert.equal(out.length, 1);
  assert.equal(out[0].duration, 120);
  assert.equal(out[0].startTime, T0);
});

test("段内保留停留最久的 entity", () => {
  const list = [
    hb({ time: T0, entity: "/p/a.ts" }),
    hb({ time: T0 + 120, entity: "/p/a.ts" }),
    hb({ time: T0 + 240, entity: "/p/b.ts" }),
    hb({ time: T0 + 300, entity: "/p/b.ts" }),
    hb({ time: T0 + 360, entity: "/p/a.ts" }),
  ];
  const out = aggregate(list, { timezone: "Asia/Shanghai" });
  assert.equal(out.length, 1);
  assert.equal(out[0].entity, "/p/a.ts");
  assert.equal(out[0].duration, 360);
});

test("项目切换切分", () => {
  const out = aggregate([hb({ time: T0, project: "a" }), hb({ time: T0 + 60, project: "b" })], { timezone: "Asia/Shanghai" });
  assert.equal(out.length, 2);
});

test("maxGap 截断单次间隔", () => {
  const out = aggregate([hb({ time: T0 }), hb({ time: T0 + 300 })], { maxGap: 120, timezone: "Asia/Shanghai" });
  assert.equal(out.length, 1);
  assert.equal(out[0].duration, 120);
});

test("localDay 按指定时区", () => {
  assert.equal(localDay(Date.UTC(2026, 9, 20, 16, 1, 0) / 1000, "Asia/Shanghai"), "2026-10-21");
  assert.equal(localDay(Date.UTC(2026, 9, 20, 16, 1, 0) / 1000, "UTC"), "2026-10-20");
});

test("mergeDurations 合并相接同组段", () => {
  const out = aggregate([hb({ time: T0 }), hb({ time: T0 + 60 }), hb({ time: T0 + 1000 }), hb({ time: T0 + 1060 })], {
    timeout: 600,
    timezone: "Asia/Shanghai",
  });
  assert.equal(out.length, 2);
  const merged = mergeDurations(out);
  assert.equal(merged.length, 2);
});

