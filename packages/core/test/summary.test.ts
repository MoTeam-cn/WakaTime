import test from "node:test";
import assert from "node:assert/strict";
import { aggregate } from "../src/aggregate.ts";
import { summarizeDay, sumDuration, sumWithLanguage } from "../src/summary.ts";
import { hb, T0 } from "./helpers.ts";

test("语言榜排除无语言活动，总和小于总时长", () => {
  const list = [
    hb({ time: T0, language: "TypeScript" }),
    hb({ time: T0 + 600, language: "TypeScript" }),
    hb({ time: T0 + 660, language: null, category: "browsing", entity: "github.com", type: "domain" }),
    hb({ time: T0 + 720, language: null, category: "browsing", entity: "github.com", type: "domain" }),
  ];
  const durs = aggregate(list, { timezone: "Asia/Shanghai" });
  const s = summarizeDay("2026-10-20", durs);
  assert.equal(sumDuration(durs), 660);
  assert.equal(sumWithLanguage(durs), 600);
  assert.equal(s.languages.length, 1);
  assert.equal(s.languages[0].name, "TypeScript");
  assert.equal(s.languages[0].total_seconds, 600);
  assert.equal(s.categories.length, 2);
});

test("项目/分支/编辑器维度", () => {
  const list = [
    hb({ time: T0, project: "a", branch: "main", editor: "vscode" }),
    hb({ time: T0 + 60, project: "a", branch: "main", editor: "vscode" }),
    hb({ time: T0 + 120, project: "b", branch: "dev", editor: "cursor" }),
    hb({ time: T0 + 180, project: "b", branch: "dev", editor: "cursor" }),
  ];
  const s = summarizeDay("2026-10-20", aggregate(list, { timezone: "Asia/Shanghai" }));
  assert.equal(s.projects.length, 2);
  assert.equal(s.branches.length, 2);
  assert.equal(s.editors.length, 2);
  assert.equal(s.grandTotal.total_seconds, 120);
});

