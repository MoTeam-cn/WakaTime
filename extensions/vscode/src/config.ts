import * as vscode from "vscode";

export interface WakaConfig {
  apiUrl: string;
  apiKey: string;
  enabled: boolean;
  statusBarEnabled: boolean;
  debug: boolean;
  exclude: string[];
  heartbeatIntervalSeconds: number;
}

export function readConfig(): WakaConfig {
  const c = vscode.workspace.getConfiguration("wakaSelfhost");
  return {
    apiUrl: String(c.get("apiUrl") ?? "http://localhost:8800/v1").replace(/\/+$/, ""),
    apiKey: String(c.get("apiKey") ?? ""),
    enabled: c.get("enabled") !== false,
    statusBarEnabled: c.get("statusBarEnabled") !== false,
    debug: c.get("debug") === true,
    exclude: (c.get("exclude") as string[] | undefined) ?? [],
    heartbeatIntervalSeconds: Number(c.get("heartbeatIntervalSeconds") ?? 120),
  };
}

