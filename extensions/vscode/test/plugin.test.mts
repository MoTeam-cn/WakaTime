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
