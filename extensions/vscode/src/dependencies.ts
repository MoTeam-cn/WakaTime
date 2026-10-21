import fs from "node:fs";
import path from "node:path";

/** 依赖上限，与官方一致控制在百条内 */
const MAX_DEPS = 100;

function readText(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function uniq(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const v = item.trim();
    if (v.length === 0 || v.length > 120) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= MAX_DEPS) break;
  }
  return out;
}

function fromJsonManifest(text: string, keys: string[]): string[] {
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    const out: string[] = [];
    for (const key of keys) {
      const value = json[key];
      if (value && typeof value === "object") out.push(...Object.keys(value as Record<string, unknown>));
    }
    return out;
  } catch {
    return [];
  }
}

function fromGoMod(text: string): string[] {
  const out: string[] = [];
  const block = /require\s*\(([\s\S]*?)\)/g;
  let m: RegExpExecArray | null;
  while ((m = block.exec(text)) !== null) {
    for (const line of m[1].split("\n")) {
      const t = line.trim();
      if (t.length === 0 || t.startsWith("//")) continue;
      out.push(t.split(/\s+/)[0]);
    }
  }
  for (const line of text.split("\n")) {
    const single = /^require\s+([^\s(]+)/.exec(line.trim());
    if (single) out.push(single[1]);
  }
  return out;
}

function fromRequirements(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t.length === 0 || t.startsWith("#") || t.startsWith("-")) continue;
    const name = t.split(/[=<>!~\[\s;]/)[0];
    if (name.length > 0) out.push(name);
  }
  return out;
}

function fromTomlSection(text: string, sections: string[]): string[] {
  const out: string[] = [];
  let active = false;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("[")) {
      const name = line.replace(/^\[/, "").replace(/\].*$/, "").trim();
      active = sections.includes(name);
      continue;
    }
    if (!active || line.length === 0 || line.startsWith("#")) continue;
    const m = /^"?([A-Za-z0-9_.\-]+)"?\s*=/.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

function fromPomXml(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/<artifactId>([^<]+)<\/artifactId>/g)) out.push(m[1]);
  return out;
}

function fromGradle(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(?:implementation|api|compile|testImplementation|runtimeOnly)\s*[("]'?([\w.\-]+):([\w.\-]+)/g)) {
    out.push(m[1] + ":" + m[2]);
  }
  return out;
}

function fromGemfile(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/^\s*gem\s+['"]([^'"]+)['"]/gm)) out.push(m[1]);
  return out;
}

function fromCsproj(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/<PackageReference\s+Include="([^"]+)"/g)) out.push(m[1]);
  return out;
}

function fromPubspec(text: string): string[] {
  return fromTomlSection(text.replace(/^(\s*)dependencies:/gm, "[dependencies]"), ["dependencies", "dev_dependencies"]);
}

function fromMix(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\{:([a-z0-9_]+),/g)) out.push(m[1]);
  return out;
}

function fromCmake(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/find_package\s*\(\s*([A-Za-z0-9_\-]+)/g)) out.push(m[1]);
  return out;
}

interface Manifest {
  file: string;
  parse: (text: string) => string[];
}

const MANIFESTS: Manifest[] = [
  { file: "package.json", parse: (t) => fromJsonManifest(t, ["dependencies", "devDependencies", "peerDependencies"]) },
  { file: "composer.json", parse: (t) => fromJsonManifest(t, ["require", "require-dev"]) },
  { file: "vcpkg.json", parse: (t) => { try { const j = JSON.parse(t) as { dependencies?: (string | { name?: string })[] }; return (j.dependencies ?? []).map((d) => (typeof d === "string" ? d : d.name ?? "")).filter(Boolean); } catch { return []; } } },
  { file: "go.mod", parse: fromGoMod },
  { file: "requirements.txt", parse: fromRequirements },
  { file: "requirements-dev.txt", parse: fromRequirements },
  { file: "Pipfile", parse: (t) => fromTomlSection(t, ["packages", "dev-packages"]) },
  { file: "pyproject.toml", parse: (t) => fromTomlSection(t, ["project.dependencies", "tool.poetry.dependencies", "tool.poetry.dev-dependencies"]) },
  { file: "Cargo.toml", parse: (t) => fromTomlSection(t, ["dependencies", "dev-dependencies", "build-dependencies"]) },
  { file: "pom.xml", parse: fromPomXml },
  { file: "build.gradle", parse: fromGradle },
  { file: "build.gradle.kts", parse: fromGradle },
  { file: "Gemfile", parse: fromGemfile },
  { file: "pubspec.yaml", parse: fromPubspec },
  { file: "mix.exs", parse: fromMix },
  { file: "CMakeLists.txt", parse: fromCmake },
];

/** 从项目根目录探测依赖列表（最多 100 条） */
export function detectDependencies(projectRoot: string | null): string[] {
  if (!projectRoot) return [];
  const collected: string[] = [];

  for (const manifest of MANIFESTS) {
    const text = readText(path.join(projectRoot, manifest.file));
    if (!text) continue;
    try {
      collected.push(...manifest.parse(text));
    } catch {
      /* 单个清单解析失败不影响其他 */
    }
  }

  // .NET：任意 *.csproj / *.fsproj
  try {
    for (const entry of fs.readdirSync(projectRoot)) {
      if (!/\.(csproj|fsproj|vbproj)$/i.test(entry)) continue;
      const text = readText(path.join(projectRoot, entry));
      if (text) collected.push(...fromCsproj(text));
    }
  } catch {
    /* 忽略 */
  }

  return uniq(collected);
}

