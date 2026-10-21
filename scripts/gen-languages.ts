/**
 * 从 wakatime-cli 源码生成全量语言映射表（逐行解析，避免大文件正则回溯）。
 * 用法：node --experimental-strip-types scripts/gen-languages.ts
 */
import fs from "node:fs";
import path from "node:path";

const BASE = "https://raw.githubusercontent.com/wakatime/wakatime-cli/develop/pkg/heartbeat/";

async function fetchText(name: string): Promise<string> {
  const res = await fetch(BASE + name, { headers: { "user-agent": "waka-selfhost-gen" }, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error("抓取失败 " + name + " -> " + res.status);
  return res.text();
}

function unquote(raw: string): string {
  try {
    return JSON.parse('"' + raw + '"') as string;
  } catch {
    return raw;
  }
}

function build(genSrc: string, langSrc: string): { map: Map<string, string>; unresolved: number } {
  const strConst = new Map<string, string>();
  for (const line of langSrc.split("\n")) {
    const m = /^\t(language\w+Str)\s*=\s*"((?:[^"\\]|\\.)*)"\s*$/.exec(line);
    if (m) strConst.set(m[1], unquote(m[2]));
  }

  const langToStrName = new Map<string, string>();
  const keyToLang = new Map<string, string>();
  for (const line of genSrc.split("\n")) {
    const a = /^\t(Language\w+):\s*(language\w+Str),\s*$/.exec(line);
    if (a) { langToStrName.set(a[1], a[2]); continue; }
    const b = /^\t"((?:[^"\\]|\\.)*)":\s+(Language\w+),\s*$/.exec(line);
    if (b) keyToLang.set(unquote(b[1]), b[2]);
  }

  const map = new Map<string, string>();
  let unresolved = 0;
  for (const [key, langConst] of keyToLang) {
    const strName = langToStrName.get(langConst);
    const display = strName ? strConst.get(strName) : undefined;
    if (!display) { unresolved++; continue; }
    map.set(key, display);
  }
  return { map, unresolved };
}

function render(map: Map<string, string>): string {
  const keys = [...map.keys()].sort();
  const names = [...new Set(map.values())].sort();
  const out: string[] = [];
  out.push("// 自动生成，请勿手改。");
  out.push("// 来源：wakatime-cli pkg/heartbeat/language_generated.go 与 language.go");
  out.push("// 重新生成：node --experimental-strip-types scripts/gen-languages.ts");
  out.push("// 条目数：" + keys.length + "，去重语言名：" + names.length);
  out.push("");
  out.push("export const LANGUAGE_BY_KEY: Readonly<Record<string, string>> = {");
  for (const k of keys) out.push("  " + JSON.stringify(k) + ": " + JSON.stringify(map.get(k)) + ",");
  out.push("};");
  out.push("");
  out.push("export const OFFICIAL_LANGUAGE_NAMES: readonly string[] = [");
  for (const n of names) out.push("  " + JSON.stringify(n) + ",");
  out.push("];");
  return out.join("\n") + "\n";
}

async function run(): Promise<void> {
  const [genSrc, langSrc] = await Promise.all([fetchText("language_generated.go"), fetchText("language.go")]);
  console.log("已下载：" + Math.round(genSrc.length / 1024) + "KB + " + Math.round(langSrc.length / 1024) + "KB");
  const { map, unresolved } = build(genSrc, langSrc);
  const content = render(map);
  const targets = ["packages/core/src/language-data.ts", "extensions/vscode/src/language-data.ts"];
  for (const t of targets) {
    const p = path.resolve(t);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, "utf8");
  }
  console.log("生成完成：" + map.size + " 条映射，" + new Set(map.values()).size + " 个语言名，未解析 " + unresolved + " 条");
}

await run();

