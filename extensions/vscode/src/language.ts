import { LANGUAGE_BY_KEY } from "./language-data.ts";

/**
 * VS Code languageId → WakaTime 官方语言名。
 * languageId 与官方规范化字符串不完全一致（typescriptreact、jsonc、shellscript 等），
 * 所以先查这张 VS Code 专表，再落到官方全量表。
 */
const BY_LANGUAGE_ID: Record<string, string> = {
  typescript: "TypeScript",
  typescriptreact: "TypeScript",
  javascript: "JavaScript",
  javascriptreact: "JavaScript",
  vue: "Vue.js",
  svelte: "Svelte",
  astro: "Astro",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  sass: "Sass",
  less: "LESS",
  stylus: "Stylus",
  json: "JSON",
  jsonc: "JSON",
  json5: "JSON",
  yaml: "YAML",
  toml: "TOML",
  xml: "XML",
  markdown: "Markdown",
  mdx: "Markdown",
  python: "Python",
  go: "Go",
  rust: "Rust",
  java: "Java",
  kotlin: "Kotlin",
  scala: "Scala",
  groovy: "Groovy",
  c: "C",
  cpp: "C++",
  objectivec: "Objective-C",
  objectivecpp: "Objective-C++",
  csharp: "C#",
  fsharp: "F#",
  vb: "Visual Basic",
  php: "PHP",
  ruby: "Ruby",
  swift: "Swift",
  dart: "Dart",
  lua: "Lua",
  perl: "Perl",
  r: "R",
  julia: "Julia",
  matlab: "MATLAB",
  elixir: "Elixir",
  erlang: "Erlang",
  haskell: "Haskell",
  clojure: "Clojure",
  ocaml: "OCaml",
  zig: "Zig",
  nim: "Nim",
  crystal: "Crystal",
  elm: "Elm",
  sql: "SQL",
  mysql: "SQL",
  pgsql: "SQL",
  plsql: "SQL",
  shellscript: "Bash",
  bash: "Bash",
  sh: "Bash",
  zsh: "Zsh",
  fish: "Fish",
  powershell: "PowerShell",
  bat: "Batch",
  cmd: "Batch",
  dockerfile: "Docker",
  dockercompose: "Docker",
  terraform: "Terraform",
  hcl: "HCL",
  nix: "Nix",
  cmake: "CMake",
  makefile: "Makefile",
  graphql: "GraphQL",
  proto: "Protocol Buffer",
  protobuf: "Protocol Buffer",
  ini: "INI",
  properties: "INI",
  assembly: "Assembly",
  vhdl: "VHDL",
  verilog: "Verilog",
  systemverilog: "SystemVerilog",
  solidity: "Solidity",
  fortran: "Fortran",
  cobol: "COBOL",
  ada: "Ada",
  delphi: "Delphi",
  pascal: "Pascal",
  lisp: "Lisp",
  scheme: "Scheme",
  racket: "Racket",
  prolog: "Prolog",
  tcl: "Tcl",
  awk: "Awk",
  jupyter: "Jupyter Notebook",
  latex: "TeX",
  tex: "TeX",
  plaintext: "Text",
  text: "Text",
  log: "Text",
  ignore: "Ignore List",
  gitignore: "Ignore List",
  dotenv: "Environment Variables",
  http: "HTTP Request",
  restructuredtext: "reStructuredText",
  asciidoc: "AsciiDoc",
  twig: "Twig",
  blade: "Blade",
  handlebars: "Handlebars",
  mustache: "Mustache",
  ejs: "EJS",
  pug: "Pug",
  haml: "Haml",
  slim: "Slim",
  nunjucks: "Nunjucks",
  liquid: "Liquid",
};

/** 扩展名兜底（languageId 缺失时用） */
const BY_EXTENSION: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", mts: "TypeScript", cts: "TypeScript",
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  vue: "Vue.js", svelte: "Svelte", astro: "Astro",
  py: "Python", pyw: "Python", ipynb: "Jupyter Notebook",
  go: "Go", rs: "Rust", java: "Java", kt: "Kotlin", kts: "Kotlin",
  c: "C", h: "C", cc: "C++", cpp: "C++", cxx: "C++", hpp: "C++", hxx: "C++",
  cs: "C#", fs: "F#", vb: "Visual Basic",
  php: "PHP", rb: "Ruby", swift: "Swift", dart: "Dart", lua: "Lua",
  pl: "Perl", r: "R", jl: "Julia", m: "Objective-C", mm: "Objective-C++",
  ex: "Elixir", exs: "Elixir", erl: "Erlang", hs: "Haskell", clj: "Clojure",
  ml: "OCaml", zig: "Zig", nim: "Nim",
  html: "HTML", htm: "HTML", css: "CSS", scss: "SCSS", sass: "Sass", less: "LESS",
  json: "JSON", jsonc: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML", xml: "XML",
  md: "Markdown", markdown: "Markdown", mdx: "Markdown", rst: "reStructuredText",
  sql: "SQL", sh: "Bash", bash: "Bash", zsh: "Zsh", fish: "Fish",
  ps1: "PowerShell", psm1: "PowerShell", bat: "Batch", cmd: "Batch",
  tf: "Terraform", hcl: "HCL", nix: "Nix",
  cmake: "CMake", graphql: "GraphQL", gql: "GraphQL",
  proto: "Protocol Buffer", ini: "INI", cfg: "INI", env: "Environment Variables",
  asm: "Assembly", s: "Assembly", vhd: "VHDL", v: "Verilog", sv: "SystemVerilog",
  sol: "Solidity", f90: "Fortran", cob: "COBOL", adb: "Ada", pas: "Pascal",
  tex: "TeX", txt: "Text", log: "Text",
};

const OFFICIAL_BY_LOWER = new Map<string, string>();
for (const name of new Set(Object.values(LANGUAGE_BY_KEY))) {
  OFFICIAL_BY_LOWER.set(name.toLowerCase(), name);
}

/**
 * 语言归一。优先级：VS Code languageId → 扩展名 → 官方全量表 → 已是官方名 → 原样保留。
 * 未识别返回 null（该心跳不计入语言榜）。
 */
export function normalizeLanguage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (v.length === 0) return null;
  const lower = v.toLowerCase();

  const byId = BY_LANGUAGE_ID[lower];
  if (byId) return byId;

  const byExt = BY_EXTENSION[lower];
  if (byExt) return byExt;

  const byOfficial = LANGUAGE_BY_KEY[lower];
  if (byOfficial) return byOfficial;

  // 传入的是路径或文件名
  if (lower.includes("/") || lower.includes("\\") || lower.includes(".")) {
    const base = lower.split(/[\\/]/).pop() ?? lower;
    if (base === "dockerfile") return "Docker";
    if (base === "makefile") return "Makefile";
    const dot = base.lastIndexOf(".");
    if (dot >= 0) {
      const ext = base.slice(dot + 1);
      const hit = BY_EXTENSION[ext] ?? LANGUAGE_BY_KEY[ext];
      if (hit) return hit;
    }
  }

  const alreadyOfficial = OFFICIAL_BY_LOWER.get(lower);
  if (alreadyOfficial) return alreadyOfficial;

  if (/^[A-Za-z0-9+#.\- ]{1,40}$/.test(v)) return v;
  return null;
}

export function languageFromPath(filePath: string): string | null {
  return normalizeLanguage(filePath);
}


