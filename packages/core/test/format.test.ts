import test from "node:test";
import assert from "node:assert/strict";
import { buildTotal, formatText, formatDigital, formatDecimal } from "../src/format.ts";

test("formatText", () => {
  assert.equal(formatText(5400), "1 hr 30 mins");
  assert.equal(formatText(3600), "1 hr");
  assert.equal(formatText(60), "1 min");
  assert.equal(formatText(45), "45 secs");
  assert.equal(formatText(0), "0 secs");
  assert.equal(formatText(7200), "2 hrs");
});

test("formatDigital", () => {
  assert.equal(formatDigital(5400), "1:30");
  assert.equal(formatDigital(45), "0:00");
  assert.equal(formatDigital(3900), "1:05");
});

test("formatDecimal", () => {
  assert.equal(formatDecimal(5400), "1.50");
  assert.equal(formatDecimal(0), "0.00");
});

test("buildTotal 结构", () => {
  const t = buildTotal(5400);
  assert.equal(t.total_seconds, 5400);
  assert.equal(t.hours, 1);
  assert.equal(t.minutes, 30);
  assert.equal(t.text, "1 hr 30 mins");
  assert.equal(t.digital, "1:30");
  assert.equal(t.decimal, "1.50");
});

