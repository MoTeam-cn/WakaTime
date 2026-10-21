import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseIni, applyIni, DEFAULTS } from "../dist/config-schema.js";
import { PatternSet, shouldTrack, shouldHideFile, shouldHideProject, shouldHideBranch } from "../dist/filters.js";
import { detectDependencies } from "../dist/dependencies.js";
import { detectProject, hasProjectFileNear } from "../dist/project.js";
import { HeartbeatBuffer } from "../dist/buffer.js";
import { normalizeLanguage } from "../dist/language.js";
import type { QueuedHeartbeat } from "../dist/offline.js";

const TMP = path.join(process.cwd(), ".tmp-plugin-test");

function resetTmp(): string {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  return TMP;
}

function writeFile(rel: string, content: string): string {
  const target = path.join(TMP, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
  return target;
}

// ---------- 配置：INI 解析 ----------
test("parseIni 解析 section 与键值，忽略注释", () => {
  const ini = parseIni([
    "# 注释",
    "[settings]",
    "api_key = waka_abc",
    "debug = true",
    "exclude = node_modules,dist",
    "[other]",
    "x = 1",
  ].join("\n"));
  assert.equal(ini.settings.api_key, "waka_abc");
  assert.equal(ini.settings.debug, "true");
  assert.equal(ini.settings.exclude, "node_modules,dist");
  assert.equal(ini.other.x, "1");
});

test("applyIni 覆盖默认值并转换类型", () => {
  const ini = parseIni([
    "[settings]",
    "api_key = k",
    "heartbeat_rate_limit_seconds = 30",
    "hide_file_names = true",
    "hide_branch_names = main,dev",
    "exclude = a,b",
    "status_bar_hide_minutes = 1",
    "timeout = 12",
    "offline = false",
  ].join("\n")).settings;
  const c = applyIni(DEFAULTS, ini);
  assert.equal(c.apiKey, "k");
  assert.equal(c.heartbeatRateLimitSeconds, 30);
  assert.equal(c.hideFileNames, true);
  assert.deepEqual(c.hideBranchNames, ["main", "dev"]);
  assert.deepEqual(c.exclude, ["a", "b"]);
  assert.equal(c.statusBarHideMinutes, true);
  assert.equal(c.timeout, 12);
  assert.equal(c.offline, false);
});

test("applyIni 对非法数值保持默认", () => {
  const c = applyIni(DEFAULTS, { timeout: "abc", debug: "maybe" });
  assert.equal(c.timeout, DEFAULTS.timeout);
  assert.equal(c.debug, DEFAULTS.debug);
});

// ---------- 过滤：POSIX 正则 ----------
test("PatternSet 支持正则与非法模式退化", () => {
  const set = new PatternSet(["\\.min\\.js$", "/node_modules/", "([bad"]);
  assert.equal(set.matches("/p/app.min.js"), true);
  assert.equal(set.matches("/p/node_modules/x.js"), true);
  assert.equal(set.matches("/p/src/app.js"), false);
  assert.equal(set.matches("/p/([bad/file.js"), true);
});

test("shouldTrack：exclude 命中跳过，include 优先保留", () => {
  const base = { ...DEFAULTS, exclude: ["\\.log$"], include: ["keep\\.log$"] };
  assert.equal(shouldTrack("/a/b.js", false, base), true);
  assert.equal(shouldTrack("/a/b.log", false, base), false);
  assert.equal(shouldTrack("/a/keep.log", false, base), true);
});

test("shouldTrack：includeOnlyWithProjectFile 要求项目文件", () => {
  const cfg = { ...DEFAULTS, includeOnlyWithProjectFile: true };
  assert.equal(shouldTrack("/a/b.js", false, cfg), false);
  assert.equal(shouldTrack("/a/b.js", true, cfg), true);
});

test("隐私开关：文件名 / 项目 / 分支", () => {
  assert.equal(shouldHideFile("/a/secret.js", { ...DEFAULTS, hideFileNames: true }), true);
  assert.equal(shouldHideFile("/a/ok.js", DEFAULTS), false);
  assert.equal(shouldHideFile("/a/secret.js", { ...DEFAULTS, hideFileNames: ["secret"] }), true);
  assert.equal(shouldHideProject("myproj", { ...DEFAULTS, hideProjectNames: true }), true);
  assert.equal(shouldHideProject(null, { ...DEFAULTS, hideProjectNames: true }), false);
  assert.equal(shouldHideBranch("main", { ...DEFAULTS, hideBranchNames: ["main"] }), true);
});

// ---------- 依赖检测 ----------
test("detectDependencies 解析 package.json", () => {
  resetTmp();
  writeFile("package.json", JSON.stringify({ dependencies: { react: "18" }, devDependencies: { vitest: "1" } }));
  const deps = detectDependencies(TMP);
  assert.ok(deps.includes("react"));
  assert.ok(deps.includes("vitest"));
});

test("detectDependencies 解析 go.mod 与 requirements.txt", () => {
  resetTmp();
  writeFile("go.mod", "module x\n\nrequire (\n\tgithub.com/a/b v1.0.0\n\tgithub.com/c/d v2.0.0\n)\n");
  writeFile("requirements.txt", "# comment\nrequests==2.31\nflask>=3\n");
  const deps = detectDependencies(TMP);
  assert.ok(deps.includes("github.com/a/b"));
  assert.ok(deps.includes("requests"));
  assert.ok(deps.includes("flask"));
});

test("detectDependencies 解析 Cargo.toml 与 pom.xml", () => {
  resetTmp();
  writeFile("Cargo.toml", "[package]\nname = \"x\"\n\n[dependencies]\nserde = \"1\"\n");
  writeFile("pom.xml", "<project><dependencies><dependency><artifactId>guava</artifactId></dependency></dependencies></project>");
  const deps = detectDependencies(TMP);
  assert.ok(deps.includes("serde"));
  assert.ok(deps.includes("guava"));
});

test("detectDependencies 无清单时返回空", () => {
  resetTmp();
  assert.deepEqual(detectDependencies(TMP), []);
  assert.deepEqual(detectDependencies(null), []);
});

// ---------- 项目识别 ----------
test("detectProject 识别 .git 与分支", () => {
  resetTmp();
  const dir = path.join(TMP, "proj");
  fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".git", "HEAD"), "ref: refs/heads/feature/x\n", "utf8");
  const file = path.join(dir, "src", "a.js");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "", "utf8");
  const info = detectProject(file, { hideProjectNames: false, stopAtWorkspaceRoot: null });
  assert.equal(info.project, "proj");
  assert.equal(info.branch, "feature/x");
  assert.equal(info.hasProjectFile, false);
  assert.ok(info.rootDir?.endsWith("proj"));
});

test("detectProject 优先 .wakatime-project 且识别 hasProjectFile", () => {
  resetTmp();
  const dir = path.join(TMP, "anon");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, ".wakatime-project"), "my-custom-name\n", "utf8");
  const file = path.join(dir, "a.js");
  fs.writeFileSync(file, "", "utf8");
  const info = detectProject(file, { hideProjectNames: true, stopAtWorkspaceRoot: null });
  assert.equal(info.project, "my-custom-name");
  assert.equal(info.hasProjectFile, true);
  assert.equal(hasProjectFileNear(file), true);
});

test("detectProject 无标记时返回空", () => {
  resetTmp();
  const file = writeFile("loose/a.js", "");
  const info = detectProject(file, { hideProjectNames: false, stopAtWorkspaceRoot: TMP });
  assert.equal(info.project, null);
  assert.equal(info.branch, null);
});

test("hideProjectNames 生成稳定的匿名项目名", () => {
  resetTmp();
  const dir = path.join(TMP, "priv");
  fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".git", "HEAD"), "ref: refs/heads/main\n", "utf8");
  const file = path.join(dir, "a.js");
  fs.writeFileSync(file, "", "utf8");
  const first = detectProject(file, { hideProjectNames: true, stopAtWorkspaceRoot: null });
  const second = detectProject(file, { hideProjectNames: true, stopAtWorkspaceRoot: null });
  assert.ok(first.project?.startsWith("anon-"));
  assert.equal(first.project, second.project);
  assert.equal(fs.readFileSync(path.join(dir, ".wakatime-project"), "utf8").trim(), first.project);
});

// ---------- 心跳缓冲 ----------
function hb(n: number): QueuedHeartbeat {
  return {
    entity: "/a/" + n + ".js", type: "file", category: "coding", time: n, project: null, branch: null,
    language: "TypeScript", lines: 1, lineno: 1, cursorpos: 0, is_write: false, project_root_count: null, machine_name_id: "m",
  };
}

test("HeartbeatBuffer 满 25 条立即 flush", () => {
  const batches: QueuedHeartbeat[][] = [];
  const buffer = new HeartbeatBuffer((items) => batches.push(items), 60_000, 25);
  for (let i = 0; i < 25; i++) buffer.push(hb(i));
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 25);
  assert.equal(buffer.size, 0);
  buffer.dispose();
});

test("HeartbeatBuffer 未满时保持缓冲，dispose 时冲刷", () => {
  const batches: QueuedHeartbeat[][] = [];
  const buffer = new HeartbeatBuffer((items) => batches.push(items), 60_000, 25);
  buffer.push(hb(1));
  buffer.push(hb(2));
  assert.equal(batches.length, 0);
  assert.equal(buffer.size, 2);
  buffer.dispose();
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 2);
});

// ---------- 语言 ----------
test("normalizeLanguage 插件侧与官方表一致", () => {
  assert.equal(normalizeLanguage("typescript"), "TypeScript");
  assert.equal(normalizeLanguage("typescriptreact"), "TypeScript");
  assert.equal(normalizeLanguage("cpp"), "C++");
  assert.equal(normalizeLanguage("/p/a.py"), "Python");
  assert.equal(normalizeLanguage("Dockerfile"), "Docker");
  assert.equal(normalizeLanguage(""), null);
});

// ---------- AI 会话日志 ----------
import { syncAllTranscripts, syncClaude, syncCodex, claudeTranscriptPaths } from "../dist/ai-transcript.js";

const AI_HOME = path.join(TMP, "ai-home");

function writeTranscript(rel: string, lines: object[]): string {
  const target = path.join(AI_HOME, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, lines.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf8");
  return target;
}

test("Claude：structuredPatch 写操作生成心跳", () => {
  resetTmp();
  writeTranscript(".claude/projects/-Users-x-proj/s1.jsonl", [
    { timestamp: "2026-10-21T10:00:00.000Z", sessionId: "s1", cwd: "/Users/x/proj", type: "user",
      toolUseResult: { filePath: "/Users/x/proj/a.ts", structuredPatch: [{ oldLines: 2, newLines: 5 }] } },
  ]);
  const result = syncClaude(AI_HOME, {});
  assert.equal(result.heartbeats.length, 1);
  const hb = result.heartbeats[0];
  assert.equal(hb.tool, "Claude");
  assert.equal(hb.entity, "/Users/x/proj/a.ts");
  assert.equal(hb.isWrite, true);
  assert.equal(hb.lineChanges, 3);
  assert.equal(hb.project, "proj");
  assert.equal(hb.time, Date.parse("2026-10-21T10:00:00.000Z") / 1000);
});

test("Claude：originalFile 非空是读操作，不产生心跳", () => {
  resetTmp();
  writeTranscript(".claude/projects/-Users-x-proj/s2.jsonl", [
    { timestamp: "2026-10-21T10:01:00.000Z", sessionId: "s2", cwd: "/Users/x/proj",
      toolUseResult: { filePath: "/Users/x/proj/a.ts", originalFile: "line1\nline2" } },
  ]);
  assert.equal(syncClaude(AI_HOME, {}).heartbeats.length, 0);
});

test("Claude：newString 创建文件按行数计算", () => {
  resetTmp();
  writeTranscript(".claude/projects/-Users-x-proj/s3.jsonl", [
    { timestamp: "2026-10-21T10:02:00.000Z", sessionId: "s3", cwd: "/Users/x/proj",
      toolUseResult: { filePath: "/Users/x/proj/new.ts", newString: "a\nb\nc\nd" } },
  ]);
  const hbs = syncClaude(AI_HOME, {}).heartbeats;
  assert.equal(hbs.length, 1);
  assert.equal(hbs[0].lineChanges, 4);
});

test("Claude：sub-agent task output 路径被忽略", () => {
  resetTmp();
  writeTranscript(".claude/projects/-Users-x-proj/s4.jsonl", [
    { timestamp: "2026-10-21T10:03:00.000Z", sessionId: "s4", cwd: "/Users/x/proj",
      toolUseResult: { filePath: "/private/tmp/claude-501/-Users-x-proj/abc/tasks/t1.output", newString: "x" } },
  ]);
  assert.equal(syncClaude(AI_HOME, {}).heartbeats.length, 0);
});

test("Claude：增量读取，第二次不重复", () => {
  resetTmp();
  writeTranscript(".claude/projects/-Users-x-proj/s5.jsonl", [
    { timestamp: "2026-10-21T10:04:00.000Z", sessionId: "s5", cwd: "/Users/x/proj",
      toolUseResult: { filePath: "/Users/x/proj/a.ts", structuredPatch: [{ oldLines: 1, newLines: 2 }] } },
  ]);
  const first = syncClaude(AI_HOME, {});
  assert.equal(first.heartbeats.length, 1);
  const second = syncClaude(AI_HOME, first.newState);
  assert.equal(second.heartbeats.length, 0);
  assert.equal(second.filesTouched, 0);
});

test("Codex：apply_patch 解析文件与行数", () => {
  resetTmp();
  writeTranscript(".codex/sessions/2026/10/21/rollout-1.jsonl", [
    { timestamp: "2026-10-21T11:00:00.000Z", type: "response_item",
      payload: { type: "function_call", name: "apply_patch", cwd: "/Users/x/proj",
        input: "*** Begin Patch\n*** Update File: src/b.ts\n@@\n-old\n+new1\n+new2\n*** End Patch" } },
  ]);
  const result = syncCodex(AI_HOME, {});
  assert.equal(result.heartbeats.length, 1);
  const hb = result.heartbeats[0];
  assert.equal(hb.tool, "Codex");
  assert.equal(hb.entity, path.join("/Users/x/proj", "src/b.ts"));
  assert.equal(hb.lineChanges, 1);
  assert.equal(hb.project, "proj");
});

test("syncAllTranscripts 汇总并支持 excludeAi 过滤", () => {
  resetTmp();
  writeTranscript(".claude/projects/-Users-x-proj/s6.jsonl", [
    { timestamp: "2026-10-21T12:00:00.000Z", sessionId: "s6", cwd: "/Users/x/proj",
      toolUseResult: { filePath: "/Users/x/proj/keep.ts", newString: "a" } },
    { timestamp: "2026-10-21T12:01:00.000Z", sessionId: "s6", cwd: "/Users/x/proj",
      toolUseResult: { filePath: "/Users/x/proj/skip.ts", newString: "a" } },
  ]);
  const all = syncAllTranscripts({}, { home: AI_HOME });
  assert.equal(all.heartbeats.length, 2);

  const filtered = syncAllTranscripts({}, { home: AI_HOME, excludePatterns: [/skip\.ts$/] });
  assert.equal(filtered.heartbeats.length, 1);
  assert.ok(filtered.heartbeats[0].entity.endsWith("keep.ts"));
});

test("transcript 目录不存在时返回空", () => {
  resetTmp();
  const result = syncAllTranscripts({}, { home: AI_HOME });
  assert.deepEqual(result.heartbeats, []);
  assert.equal(result.filesTouched, 0);
  assert.deepEqual(claudeTranscriptPaths(AI_HOME), []);
});

// ---------- 通用提取器 ----------
import { extractEvents, dedupeEvents, toEpochSeconds, countLines } from "../dist/ai-parse.js";
import { discoverTranscripts, expandRoot, PROVIDERS, SQLITE_ONLY_PROVIDERS } from "../dist/ai-providers.js";

test("toEpochSeconds 支持秒、毫秒、ISO 字符串", () => {
  assert.equal(toEpochSeconds(1700000000), 1700000000);
  assert.equal(toEpochSeconds(1700000000000), 1700000000);
  assert.equal(toEpochSeconds("2026-10-21T10:00:00.000Z"), Date.parse("2026-10-21T10:00:00.000Z") / 1000);
  assert.equal(toEpochSeconds("abc"), null);
  assert.equal(toEpochSeconds(null), null);
});

test("countLines 处理尾换行", () => {
  assert.equal(countLines("a"), 1);
  assert.equal(countLines("a\nb"), 2);
  assert.equal(countLines("a\nb\n"), 2);
  assert.equal(countLines(""), 0);
});

test("extractEvents 绝对路径 + content", () => {
  const events = extractEvents({ timestamp: 1700000000, file_path: "/p/a.ts", content: "a\nb\nc" });
  assert.equal(events.length, 1);
  assert.equal(events[0].entity, "/p/a.ts");
  assert.equal(events[0].lineChanges, 3);
  assert.equal(events[0].time, 1700000000);
});

test("extractEvents 相对路径按 cwd 补全", () => {
  const events = extractEvents({ cwd: "/Users/x/proj", timestamp: 1700000000, path: "src/b.ts", new_string: "x\ny" });
  assert.equal(events.length, 1);
  assert.equal(events[0].entity, path.join("/Users/x/proj", "src/b.ts"));
  assert.equal(events[0].project, "proj");
});

test("extractEvents 展开嵌套 JSON 字符串（Cline 风格）", () => {
  const inner = JSON.stringify({ tool: "editedExistingFile", path: "/p/c.ts", diff: "@@ -1 +1 @@\n-a\n+b\n+c" });
  const events = extractEvents({ ts: 1700000000000, type: "say", say: "tool", text: inner });
  assert.equal(events.length, 1);
  assert.equal(events[0].entity, "/p/c.ts");
  assert.equal(events[0].lineChanges, 1);
});

test("extractEvents old/new 差值", () => {
  const events = extractEvents({ timestamp: 1700000000, filePath: "/p/d.ts", old_string: "a\nb", new_string: "a\nb\nc\nd" });
  assert.equal(events[0].lineChanges, 2);
});

test("extractEvents 缺时间戳不生成", () => {
  assert.equal(extractEvents({ file_path: "/p/a.ts", content: "x" }).length, 0);
});

test("extractEvents 跳过 URL 与多行路径", () => {
  assert.equal(extractEvents({ timestamp: 1700000000, file_path: "https://x.com/a.ts", content: "x" }).length, 0);
  assert.equal(extractEvents({ timestamp: 1700000000, file_path: "a\nb.ts", content: "x" }).length, 0);
});

test("dedupeEvents 同文件同秒取最大行数", () => {
  const events = dedupeEvents([
    { entity: "/p/a.ts", time: 100.1, lineChanges: 3, isWrite: true, project: null },
    { entity: "/p/a.ts", time: 100.9, lineChanges: 7, isWrite: true, project: null },
    { entity: "/p/b.ts", time: 100.5, lineChanges: 1, isWrite: true, project: null },
  ]);
  assert.equal(events.length, 2);
  assert.equal(events.find((e) => e.entity === "/p/a.ts")?.lineChanges, 7);
});

test("expandRoot 展开 ~ 与通配符", () => {
  resetTmp();
  const home = TMP;
  fs.mkdirSync(path.join(home, ".gemini", "tmp", "abc123"), { recursive: true });
  fs.mkdirSync(path.join(home, ".gemini", "tmp", "def456"), { recursive: true });
  const expanded = expandRoot(home, "~/.gemini/tmp/*");
  assert.equal(expanded.length, 2);
  assert.ok(expanded.every((p) => p.includes(".gemini")));
  assert.deepEqual(expandRoot(home, "~/.nope"), [path.join(home, ".nope")]);
});

function clineRoot(home: string): string {
  const provider = PROVIDERS.find((p) => p.id === "cline");
  assert.ok(provider, "provider 表里应有 cline");
  const roots = typeof provider.roots === "function" ? provider.roots(home) : provider.roots;
  return roots[0];
}

test("discoverTranscripts 找到 Cline 的 ui_messages.json", () => {
  resetTmp();
  const home = TMP;
  const clineDir = path.join(clineRoot(home), "tasks", "t1");
  fs.mkdirSync(clineDir, { recursive: true });
  fs.writeFileSync(path.join(clineDir, "ui_messages.json"), "[]", "utf8");
  const found = discoverTranscripts(home);
  assert.ok(found.some((f) => f.provider.id === "cline" && f.file.endsWith("ui_messages.json")));
});

test("syncAllTranscripts 解析 Cline 任务文件", () => {
  resetTmp();
  const home = TMP;
  const taskDir = path.join(clineRoot(home), "tasks", "t2");
  fs.mkdirSync(taskDir, { recursive: true });
  const messages = [
    { ts: 1700000000000, type: "say", say: "tool", text: JSON.stringify({ tool: "newFileCreated", path: "/p/new.ts", content: "a\nb" }) },
  ];
  fs.writeFileSync(path.join(taskDir, "ui_messages.json"), JSON.stringify(messages), "utf8");
  const result = syncAllTranscripts({}, { home });
  assert.equal(result.heartbeats.length, 1);
  assert.equal(result.heartbeats[0].tool, "Cline");
  assert.equal(result.heartbeats[0].entity, "/p/new.ts");
  assert.equal(result.heartbeats[0].lineChanges, 2);
});

test("provider 表覆盖 50+ 工具", () => {
  const total = PROVIDERS.length + SQLITE_ONLY_PROVIDERS.length;
  assert.ok(total >= 50, "工具总数应不少于 50，实际 " + total);
  assert.ok(PROVIDERS.some((p) => p.id === "claude"));
  assert.ok(PROVIDERS.some((p) => p.id === "codex"));
  assert.ok(SQLITE_ONLY_PROVIDERS.some((p) => p.id === "cursor"));
});
