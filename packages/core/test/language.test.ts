import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLanguage } from "../src/language.ts";

test("languageId 归一", () => {
  assert.equal(normalizeLanguage("typescript"), "TypeScript");
  assert.equal(normalizeLanguage("TypeScript"), "TypeScript");
  assert.equal(normalizeLanguage("ts"), "TypeScript");
  assert.equal(normalizeLanguage("typescriptreact"), "TypeScript");
  assert.equal(normalizeLanguage("cpp"), "C++");
  assert.equal(normalizeLanguage("csharp"), "C#");
});

test("路径与扩展名兜底", () => {
  assert.equal(normalizeLanguage("/p/src/a.ts"), "TypeScript");
  assert.equal(normalizeLanguage("C:/p/main.py"), "Python");
  assert.equal(normalizeLanguage("Dockerfile"), "Docker");
  assert.equal(normalizeLanguage("Makefile"), "Makefile");
});

test("未知语言", () => {
  assert.equal(normalizeLanguage(""), null);
  assert.equal(normalizeLanguage(null), null);
});

