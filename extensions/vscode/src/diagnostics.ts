import * as vscode from "vscode";
import path from "node:path";
import type { WakaConfig } from "./config-schema.ts";
import { configFilePath } from "./config-schema.ts";
import { currentLogPath } from "./logfile.ts";
import { detectAIExtensions } from "./ai.ts";
import { detectDependencies } from "./dependencies.ts";
import type { HeartbeatSender } from "./sender.ts";
import type { OfflineQueue } from "./offline.ts";

function mask(key: string): string {
  if (!key) return "(未设置)";
  if (key.length <= 10) return key.slice(0, 3) + "***";
  return key.slice(0, 8) + "…" + key.slice(-4);
}

export function describeConfig(config: WakaConfig, queue: OfflineQueue): string[] {
  return [
    "配置文件: " + configFilePath(),
    "apiUrl: " + config.apiUrl,
    "apiKey: " + mask(config.apiKey),
    "enabled: " + config.enabled + " | debug: " + config.debug,
    "心跳最小间隔: " + config.heartbeatRateLimitSeconds + "s | 超时: " + config.timeout + "s",
    "状态栏: enabled=" + config.statusBarEnabled + " codingActivity=" + config.statusBarCodingActivity + " showCategories=" + config.statusBarShowCategories + " hideMinutes=" + config.statusBarHideMinutes + " maxCategories=" + config.statusBarMaxCategories,
    "离线队列: " + config.offline + "（待补传 " + queue.size() + " 条）",
    "代理: " + (config.proxy || "(无)") + " | 跳过证书校验: " + config.noSslVerify,
    "exclude: " + (config.exclude.length > 0 ? config.exclude.join(" , ") : "(空)"),
    "include: " + (config.include.length > 0 ? config.include.join(" , ") : "(空)"),
    "隐私: hideFileNames=" + JSON.stringify(config.hideFileNames) + " hideProjectNames=" + JSON.stringify(config.hideProjectNames) + " hideBranchNames=" + JSON.stringify(config.hideBranchNames) + " hideProjectFolder=" + config.hideProjectFolder,
    "AI: syncAiDisabled=" + config.syncAiDisabled + " excludeAi=" + (config.excludeAi.join(" , ") || "(空)") + " 已装: " + (detectAIExtensions().join(", ") || "(无)"),
    "日志文件: " + (currentLogPath() ?? "(未启用)"),
    "VS Code: " + vscode.version + " | 远程: " + (vscode.env.remoteName ?? "本地"),
  ];
}

export async function showDiagnostics(
  config: WakaConfig,
  queue: OfflineQueue,
  sender: HeartbeatSender,
  output: vscode.OutputChannel
): Promise<void> {
  output.show(true);
  output.appendLine("=== waka-selfhost 诊断 " + new Date().toISOString() + " ===");
  for (const line of describeConfig(config, queue)) output.appendLine(line);

  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const fsPath = editor.document.uri.fsPath;
    const deps = detectDependencies(path.dirname(fsPath));
    output.appendLine("当前文件: " + fsPath);
    output.appendLine("检测到的依赖: " + (deps.length > 0 ? deps.slice(0, 20).join(", ") : "(无)"));
  }

  output.appendLine("--- 连通性检查 ---");
  const ping = await sender.ping(config);
  output.appendLine("健康检查: " + (ping.health.ok ? "OK" : "失败") + " (" + ping.health.status + ") " + ping.health.message);
  output.appendLine("鉴权检查: " + (ping.auth.ok ? "OK" : "失败") + " (" + ping.auth.status + ") " + ping.auth.message);
  output.appendLine("=== 诊断结束 ===");
}

