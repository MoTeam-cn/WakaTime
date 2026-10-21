import * as vscode from "vscode";
import { DEFAULTS, readIniConfig, applyIni } from "./config-schema.ts";
import type { WakaConfig } from "./config-schema.ts";

export type { WakaConfig, BoolOrList } from "./config-schema.ts";
export { DEFAULTS, configFilePath, legacyConfigPath, wakatimeHome, parseIni, readIniConfig, writeIniValue } from "./config-schema.ts";
import { legacyConfigPath, readIniConfig as readIni } from "./config-schema.ts";

/** VS Code 设置覆盖（优先级高于 wakatime.cfg） */
function applySettings(base: WakaConfig): WakaConfig {
  const c: WakaConfig = { ...base };
  const s = vscode.workspace.getConfiguration("wakaSelfhost");

  const apiKey = s.get<string>("apiKey");
  if (apiKey !== undefined && apiKey !== "") c.apiKey = apiKey;
  const apiUrl = s.get<string>("apiUrl");
  if (apiUrl !== undefined && apiUrl !== "") c.apiUrl = apiUrl.replace(/\/+$/, "");
  const debug = s.get<boolean>("debug");
  if (debug !== undefined) c.debug = debug;
  const enabled = s.get<boolean>("enabled");
  if (enabled !== undefined) c.enabled = enabled;
  const statusBar = s.get<boolean>("statusBarEnabled");
  if (statusBar !== undefined) c.statusBarEnabled = statusBar;
  const coding = s.get<boolean>("statusBarCodingActivity");
  if (coding !== undefined) c.statusBarCodingActivity = coding;
  const hideMinutes = s.get<boolean>("statusBarHideMinutes");
  if (hideMinutes !== undefined) c.statusBarHideMinutes = hideMinutes;
  const rate = s.get<number>("heartbeatRateLimitSeconds");
  if (rate !== undefined) c.heartbeatRateLimitSeconds = rate;
  const exclude = s.get<string[]>("exclude");
  if (exclude !== undefined && exclude.length > 0) c.exclude = exclude;
  const include = s.get<string[]>("include");
  if (include !== undefined && include.length > 0) c.include = include;
  const proxy = s.get<string>("proxy");
  if (proxy !== undefined && proxy !== "") c.proxy = proxy;
  const logFile = s.get<string>("logFile");
  if (logFile !== undefined && logFile !== "") c.logFile = logFile;
  const align = s.get<string>("align");
  if (align === "left" || align === "right") c.align = align;
  const alignPriority = s.get<number>("alignPriority");
  if (alignPriority !== undefined) c.alignPriority = alignPriority;

  return c;
}

/** 生效配置：默认值 → import_cfg → ~/.wakatime.cfg → VS Code 设置 */
export function readConfig(): WakaConfig {
  let c: WakaConfig = { ...DEFAULTS };
  const ini = readIniConfig();
  if (ini.import_cfg) {
    const imported = readIniConfig(ini.import_cfg);
    c = applyIni(c, imported);
  }
  c = applyIni(c, ini);
  c = applySettings(c);
  return c;
}

/** 是否已完成必要配置（服务端地址 + API Key） */
export function isConfigured(config: WakaConfig): boolean {
  return config.apiUrl.trim().length > 0 && config.apiKey.trim().length > 0;
}

/** 官方插件配置文件里是否有 api_key（用于提示用户，不会自动读取） */
export function hasLegacyConfig(): boolean {
  const ini = readIni(legacyConfigPath());
  return typeof ini.api_key === "string" && ini.api_key.trim().length > 0;
}
