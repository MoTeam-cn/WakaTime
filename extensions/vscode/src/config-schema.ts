import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type BoolOrList = boolean | string[];

/** 与 wakatime-cli 的 ~/.wakatime.cfg 对齐的完整配置 */
export interface WakaConfig {
  apiKey: string;
  apiKeyVaultCmd: string;
  apiUrl: string;
  debug: boolean;
  heartbeatRateLimitSeconds: number;
  hideFileNames: BoolOrList;
  hideProjectNames: BoolOrList;
  hideBranchNames: BoolOrList;
  hideDependencies: BoolOrList;
  hideProjectFolder: boolean;
  exclude: string[];
  include: string[];
  includeOnlyWithProjectFile: boolean;
  excludeUnknownProject: boolean;
  statusBarEnabled: boolean;
  statusBarCodingActivity: boolean;
  statusBarShowCategories: boolean;
  statusBarHideMinutes: boolean;
  statusBarMaxCategories: number;
  offline: boolean;
  proxy: string;
  noSslVerify: boolean;
  sslCertsFile: string;
  timeout: number;
  hostname: string;
  logFile: string;
  importCfg: string;
  metrics: boolean;
  guessLanguage: boolean;
  syncAiDisabled: boolean;
  excludeAi: string[];
  submodulesDisabled: string[];
  enabled: boolean;
  align: string;
  alignPriority: number;
}

export const DEFAULTS: WakaConfig = {
  apiKey: "",
  apiKeyVaultCmd: "",
  apiUrl: "http://localhost:8800/v1",
  debug: false,
  heartbeatRateLimitSeconds: 120,
  hideFileNames: false,
  hideProjectNames: false,
  hideBranchNames: false,
  hideDependencies: false,
  hideProjectFolder: false,
  exclude: [],
  include: [],
  includeOnlyWithProjectFile: false,
  excludeUnknownProject: false,
  statusBarEnabled: true,
  statusBarCodingActivity: false,
  statusBarShowCategories: false,
  statusBarHideMinutes: false,
  statusBarMaxCategories: 4,
  offline: true,
  proxy: "",
  noSslVerify: false,
  sslCertsFile: "",
  timeout: 30,
  hostname: "",
  logFile: "",
  importCfg: "",
  metrics: false,
  guessLanguage: false,
  syncAiDisabled: false,
  excludeAi: [],
  submodulesDisabled: [],
  enabled: true,
  align: "left",
  alignPriority: 1,
};

/** wakatime.cfg 所在目录：优先 WAKATIME_HOME，否则用户主目录 */
export function wakatimeHome(): string {
  const envHome = process.env.WAKATIME_HOME;
  if (envHome && envHome.trim().length > 0) return envHome.trim();
  return os.homedir();
}

export function configFilePath(): string {
  return path.join(wakatimeHome(), ".wakatime.cfg");
}

/** 极简 INI 解析：支持 [section]、key = value、# 与 ; 注释 */
export function parseIni(content: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  let section = "settings";
  out[section] = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#") || line.startsWith(";")) continue;
    if (line.startsWith("[") && line.endsWith("]")) {
      section = line.slice(1, -1).trim().toLowerCase();
      out[section] = out[section] ?? {};
      continue;
    }
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const value = line.slice(eq + 1).trim();
    out[section][key] = value;
  }
  return out;
}

function toBool(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  const s = v.trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return undefined;
}

function toInt(v: string | undefined): number | undefined {
  if (v === undefined || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** 逗号分隔列表；"true" 表示全部隐藏（返回 true） */
function toBoolOrList(v: string | undefined): BoolOrList | undefined {
  if (v === undefined) return undefined;
  const b = toBool(v);
  if (b !== undefined) return b;
  const list = v.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  return list.length > 0 ? list : undefined;
}

function toList(v: string | undefined): string[] | undefined {
  if (v === undefined || v.trim() === "") return undefined;
  return v.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

/** 读取 wakatime.cfg（不存在则返回空） */
export function readIniConfig(filePath?: string): Record<string, string> {
  const target = filePath ?? configFilePath();
  try {
    const parsed = parseIni(fs.readFileSync(target, "utf8"));
    return parsed.settings ?? {};
  } catch {
    return {};
  }
}

export function applyIni(base: WakaConfig, ini: Record<string, string>): WakaConfig {
  const c: WakaConfig = { ...base };
  if (ini.api_key) c.apiKey = ini.api_key;
  if (ini.api_key_vault_cmd) c.apiKeyVaultCmd = ini.api_key_vault_cmd;
  if (ini.api_url) c.apiUrl = ini.api_url.replace(/\/+$/, "");
  const dbg = toBool(ini.debug); if (dbg !== undefined) c.debug = dbg;
  const rate = toInt(ini.heartbeat_rate_limit_seconds); if (rate !== undefined) c.heartbeatRateLimitSeconds = rate;
  const hf = toBoolOrList(ini.hide_file_names); if (hf !== undefined) c.hideFileNames = hf;
  const hp = toBoolOrList(ini.hide_project_names); if (hp !== undefined) c.hideProjectNames = hp;
  const hb = toBoolOrList(ini.hide_branch_names); if (hb !== undefined) c.hideBranchNames = hb;
  const hd = toBoolOrList(ini.hide_dependencies); if (hd !== undefined) c.hideDependencies = hd;
  const hpf = toBool(ini.hide_project_folder); if (hpf !== undefined) c.hideProjectFolder = hpf;
  const ex = toList(ini.exclude); if (ex) c.exclude = ex;
  const inc = toList(ini.include); if (inc) c.include = inc;
  const iop = toBool(ini.include_only_with_project_file); if (iop !== undefined) c.includeOnlyWithProjectFile = iop;
  const eup = toBool(ini.exclude_unknown_project); if (eup !== undefined) c.excludeUnknownProject = eup;
  const sbe = toBool(ini.status_bar_enabled); if (sbe !== undefined) c.statusBarEnabled = sbe;
  const sbc = toBool(ini.status_bar_coding_activity); if (sbc !== undefined) c.statusBarCodingActivity = sbc;
  const sbs = toBool(ini.status_bar_show_categories); if (sbs !== undefined) c.statusBarShowCategories = sbs;
  const sbh = toBool(ini.status_bar_hide_minutes); if (sbh !== undefined) c.statusBarHideMinutes = sbh;
  const sbm = toInt(ini.status_bar_max_categories); if (sbm !== undefined) c.statusBarMaxCategories = sbm;
  const off = toBool(ini.offline); if (off !== undefined) c.offline = off;
  if (ini.proxy) c.proxy = ini.proxy;
  const nsv = toBool(ini.no_ssl_verify); if (nsv !== undefined) c.noSslVerify = nsv;
  if (ini.ssl_certs_file) c.sslCertsFile = ini.ssl_certs_file;
  const to = toInt(ini.timeout); if (to !== undefined) c.timeout = to;
  if (ini.hostname) c.hostname = ini.hostname;
  if (ini.log_file) c.logFile = ini.log_file;
  if (ini.import_cfg) c.importCfg = ini.import_cfg;
  const met = toBool(ini.metrics); if (met !== undefined) c.metrics = met;
  const gl = toBool(ini.guess_language); if (gl !== undefined) c.guessLanguage = gl;
  const sad = toBool(ini.sync_ai_disabled); if (sad !== undefined) c.syncAiDisabled = sad;
  const eai = toList(ini.exclude_ai); if (eai) c.excludeAi = eai;
  const sd = toList(ini.submodules_disabled); if (sd) c.submodulesDisabled = sd;
  return c;
}

/** 写入 wakatime.cfg 的单个键（保留其他内容与注释） */
export function writeIniValue(key: string, value: string): void {
  const file = configFilePath();
  let content = "";
  try {
    content = fs.readFileSync(file, "utf8");
  } catch {
    content = "[settings]\n";
  }
  if (!/\[settings\]/i.test(content)) content = "[settings]\n" + content;
  const lines = content.split(/\r?\n/);
  const idx = lines.findIndex((l) => {
    const t = l.trim().toLowerCase();
    return t.startsWith(key.toLowerCase() + " =") || t.startsWith(key.toLowerCase() + "=");
  });
  if (idx >= 0) {
    lines[idx] = key + " = " + value;
  } else {
    const sectionIdx = lines.findIndex((l) => l.trim().toLowerCase() === "[settings]");
    lines.splice(sectionIdx + 1, 0, key + " = " + value);
  }
  fs.writeFileSync(file, lines.join("\n"), "utf8");
}
