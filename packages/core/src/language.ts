/**
 * VS Code languageId → WakaTime 官方语言名。
 * 目的：保证语言榜与官方同名同分（ts / typescript / TypeScript 合并为一项）。
 * 来源：对齐 wakatime-cli 的 pkg/heartbeat/language_gen.go 命名习惯。
 */
const BY_ID: Record<string, string> = {
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
  perl6: "Perl",
  r: "R",
  julia: "Julia",
  matlab: "MATLAB",
  octave: "MATLAB",
  elixir: "Elixir",
  erlang: "Erlang",
  haskell: "Haskell",
  clojure: "Clojure",
  ocaml: "OCaml",
  zig: "Zig",
  nim: "Nim",
  crystal: "Crystal",
  elm: "Elm",
  purescript: "PureScript",
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
  asm: "Assembly",
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
  env: "Environment Variables",
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
  njk: "Nunjucks",
  liquid: "Liquid",
};

/** 扩展名兜底（languageId 缺失时用） */
const BY_EXT: Record<string, string> = {
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
  dockerfile: "Docker", tf: "Terraform", hcl: "HCL", nix: "Nix",
  cmake: "CMake", mk: "Makefile", graphql: "GraphQL", gql: "GraphQL",
  proto: "Protocol Buffer", ini: "INI", cfg: "INI", env: "Environment Variables",
  asm: "Assembly", s: "Assembly", vhd: "VHDL", v: "Verilog", sv: "SystemVerilog",
  sol: "Solidity", f90: "Fortran", cob: "COBOL", adb: "Ada", pas: "Pascal",
  tex: "TeX", txt: "Text", log: "Text",
};

/**
 * 语言归一：接受 languageId、扩展名或已是官方名，统一返回官方名。
 * 未识别返回 null（该心跳不计入语言榜）。
 */
export function normalizeLanguage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (v.length === 0) return null;

  const lower = v.toLowerCase();
  const byId = BY_ID[lower];
  if (byId) return byId;

  // languageId 缺失时客户端可能直接传扩展名（ts / js / py）
  const byExtDirect = BY_EXT[lower];
  if (byExtDirect) return byExtDirect;

  // 传入的是文件名或路径
  if (lower.includes("/") || lower.includes(".")) {
    const base = lower.split("/").pop() ?? lower;
    if (base === "dockerfile") return "Docker";
    if (base === "makefile") return "Makefile";
    const dot = base.lastIndexOf(".");
    if (dot >= 0) {
      const ext = base.slice(dot + 1);
      const byExt = BY_EXT[ext];
      if (byExt) return byExt;
    }
  }

  // 已经是官方名（大小写不敏感匹配）
  for (const name of Object.values(BY_ID)) {
    if (name.toLowerCase() === lower) return name;
  }
  for (const name of Object.values(BY_EXT)) {
    if (name.toLowerCase() === lower) return name;
  }

  // 形如 TypeScript 的自定义名：原样保留，避免丢失信息
  if (/^[A-Za-z0-9+#.\- ]{1,40}$/.test(v)) {
    return v;
  }
  return null;
}

export function languageFromPath(filePath: string): string | null {
  return normalizeLanguage(filePath);
}

