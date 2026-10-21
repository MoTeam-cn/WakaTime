/** 精简版语言映射：覆盖常见 languageId，未命中则按扩展名兜底 */
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
  less: "LESS",
  json: "JSON",
  jsonc: "JSON",
  yaml: "YAML",
  toml: "TOML",
  xml: "XML",
  markdown: "Markdown",
  python: "Python",
  go: "Go",
  rust: "Rust",
  java: "Java",
  kotlin: "Kotlin",
  c: "C",
  cpp: "C++",
  csharp: "C#",
  php: "PHP",
  ruby: "Ruby",
  swift: "Swift",
  dart: "Dart",
  lua: "Lua",
  sql: "SQL",
  shellscript: "Bash",
  powershell: "PowerShell",
  dockerfile: "Docker",
  terraform: "Terraform",
  plaintext: "Text",
};

const BY_EXT: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  vue: "Vue.js",
  py: "Python",
  go: "Go",
  rs: "Rust",
  java: "Java",
  kt: "Kotlin",
  c: "C",
  h: "C",
  cpp: "C++",
  cc: "C++",
  hpp: "C++",
  cs: "C#",
  php: "PHP",
  rb: "Ruby",
  swift: "Swift",
  md: "Markdown",
  json: "JSON",
  yml: "YAML",
  yaml: "YAML",
  sh: "Bash",
  ps1: "PowerShell",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  sql: "SQL",
};

export function mapLanguage(languageId: string | undefined, filePath: string): string | null {
  if (languageId) {
    const hit = BY_ID[languageId.toLowerCase()];
    if (hit) return hit;
  }
  const base = filePath.split(/[\\/]/).pop() ?? filePath;
  if (base.toLowerCase() === "dockerfile") return "Docker";
  if (base.toLowerCase() === "makefile") return "Makefile";
  const dot = base.lastIndexOf(".");
  if (dot >= 0) {
    const ext = base.slice(dot + 1).toLowerCase();
    const hit = BY_EXT[ext];
    if (hit) return hit;
  }
  return null;
}

