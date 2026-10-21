import * as vscode from "vscode";
import crypto from "node:crypto";
import path from "node:path";
import { readConfig } from "./config.ts";
import { detectProject } from "./project.ts";
import { mapLanguage } from "./language.ts";
import { OfflineQueue } from "./offline.ts";
import type { QueuedHeartbeat } from "./offline.ts";
import { HeartbeatSender } from "./sender.ts";
import { StatusBar } from "./statusbar.ts";

const DEBOUNCE_MS = 50;

let output: vscode.OutputChannel;
let statusBar: StatusBar;
let sender: HeartbeatSender;
let queue: OfflineQueue;
let machineId = "";
let lastHeartbeatAt = 0;
let lastFile = "";
let debounceId: ReturnType<typeof setTimeout> | null = null;
let paused = false;

function log(msg: string): void {
  const config = readConfig();
  if (config.debug && output) output.appendLine(new Date().toISOString() + " " + msg);
}

function isExcluded(filePath: string, patterns: string[]): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  for (const p of patterns) {
    const needle = p.replace(/\*\*/g, "").replace(/\*/g, "").replace(/^\//, "").replace(/\/$/, "");
    if (needle.length > 0 && normalized.includes(needle.replace(/^\./, "."))) return true;
  }
  return false;
}

function buildHeartbeat(editor: vscode.TextEditor, isWrite: boolean): QueuedHeartbeat | null {
  const doc = editor.document;
  const filePath = doc.uri.fsPath;
  if (!filePath) return null;
  const config = readConfig();
  if (isExcluded(filePath, config.exclude)) return null;
  const info = detectProject(filePath);
  const position = editor.selection.active;
  return {
    entity: filePath,
    type: "file",
    category: "coding",
    time: Date.now() / 1000,
    project: info.project,
    branch: info.branch,
    language: mapLanguage(doc.languageId, filePath),
    lines: doc.lineCount,
    lineno: position.line + 1,
    cursorpos: position.character,
    is_write: isWrite,
    project_root_count: info.rootCount,
    machine_name_id: machineId,
  };
}

async function maybeSend(isWrite: boolean): Promise<void> {
  const config = readConfig();
  if (!config.enabled || paused) return;
  if (!config.apiKey) {
    log("skip: apiKey 未配置");
    return;
  }
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const hb = buildHeartbeat(editor, isWrite);
  if (!hb) return;

  const now = Date.now();
  const minGap = config.heartbeatIntervalSeconds * 1000;
  const fileChanged = hb.entity !== lastFile;
  if (!isWrite && !fileChanged && now - lastHeartbeatAt < minGap) return;

  lastHeartbeatAt = now;
  lastFile = hb.entity;

  const okFlag = await sender.send(config, [hb]);
  if (okFlag && config.debug) log("heartbeat " + path.basename(hb.entity) + (isWrite ? " (write)" : ""));
  void statusBar.refresh();
}

function schedule(isWrite: boolean): void {
  if (debounceId) clearTimeout(debounceId);
  debounceId = setTimeout(() => {
    debounceId = null;
    void maybeSend(isWrite);
  }, DEBOUNCE_MS);
}

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel("waka-selfhost");
  context.subscriptions.push(output);

  machineId = context.globalState.get<string>("wakaSelfhost.machineId") ?? "";
  if (!machineId) {
    machineId = crypto.randomUUID();
    void context.globalState.update("wakaSelfhost.machineId", machineId);
  }

  const storageDir = path.join(context.globalStorageUri.fsPath, "offline");
  queue = new OfflineQueue(storageDir);
  sender = new HeartbeatSender(queue, log);
  statusBar = new StatusBar(log);
  context.subscriptions.push({ dispose: () => statusBar.dispose() });

  statusBar.start(readConfig());

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.contentChanges.length === 0) return;
      if (vscode.window.activeTextEditor?.document !== e.document) return;
      schedule(false);
    }),
    vscode.workspace.onDidSaveTextDocument(() => schedule(true)),
    vscode.window.onDidChangeActiveTextEditor(() => schedule(false)),
    vscode.window.onDidChangeTextEditorSelection((e) => {
      if (e.kind !== undefined) schedule(false);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("wakaSelfhost.setApiKey", async () => {
      const value = await vscode.window.showInputBox({ prompt: "粘贴 waka_ 开头的 API Key", password: true });
      if (value) {
        await vscode.workspace.getConfiguration("wakaSelfhost").update("apiKey", value.trim(), vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage("waka-selfhost: API Key 已保存");
        void statusBar.refresh();
      }
    }),
    vscode.commands.registerCommand("wakaSelfhost.setApiUrl", async () => {
      const current = readConfig().apiUrl;
      const value = await vscode.window.showInputBox({ prompt: "服务端 API 基址（含 /v1）", value: current });
      if (value) {
        await vscode.workspace.getConfiguration("wakaSelfhost").update("apiUrl", value.trim(), vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage("waka-selfhost: API 地址已保存");
        void statusBar.refresh();
      }
    }),
    vscode.commands.registerCommand("wakaSelfhost.openDashboard", () => {
      const url = readConfig().apiUrl.replace(/\/v1$/, "");
      void vscode.env.openExternal(vscode.Uri.parse(url));
    }),
    vscode.commands.registerCommand("wakaSelfhost.toggleStatusBar", async () => {
      const c = vscode.workspace.getConfiguration("wakaSelfhost");
      const next = c.get("statusBarEnabled") !== false;
      await c.update("statusBarEnabled", !next, vscode.ConfigurationTarget.Global);
      statusBar.start(readConfig());
    }),
    vscode.commands.registerCommand("wakaSelfhost.toggle", () => {
      paused = !paused;
      vscode.window.showInformationMessage("waka-selfhost: 上报已" + (paused ? "暂停" : "恢复"));
    }),
    vscode.commands.registerCommand("wakaSelfhost.flushOffline", async () => {
      const sent = await sender.flush(readConfig());
      vscode.window.showInformationMessage("waka-selfhost: 已补传 " + sent + " 条心跳");
    })
  );

  const flushTimer = setInterval(() => {
    const config = readConfig();
    if (config.enabled && !paused && queue.size() > 0) void sender.flush(config);
  }, 5 * 60_000);
  context.subscriptions.push({ dispose: () => clearInterval(flushTimer) });

  log("activated, machine=" + machineId + ", api=" + readConfig().apiUrl);
}

export function deactivate(): void {
  statusBar?.dispose();
}

