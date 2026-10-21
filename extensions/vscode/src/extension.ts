import * as vscode from "vscode";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readConfig, writeIniValue, configFilePath, isConfigured, hasLegacyConfig } from "./cfg.ts";
import type { WakaConfig } from "./cfg.ts";
import { detectProject, hasProjectFileNear } from "./project.ts";
import { normalizeLanguage } from "./language.ts";
import { detectDependencies } from "./dependencies.ts";
import { shouldTrack, shouldHideFile, shouldHideProject, shouldHideBranch, shouldHideDependencies } from "./filters.ts";
import { OfflineQueue } from "./offline.ts";
import type { QueuedHeartbeat } from "./offline.ts";
import { HeartbeatSender } from "./sender.ts";
import { HeartbeatBuffer } from "./buffer.ts";
import { StatusBar } from "./statusbar.ts";
import type { StatusContext } from "./statusbar.ts";
import { LineChangeTracker, detectAIExtensions } from "./ai.ts";
import { initLogFile, write as writeLog, currentLogPath } from "./logfile.ts";
import { showDiagnostics } from "./diagnostics.ts";
import { syncAllTranscripts } from "./ai-transcript.ts";
import type { TranscriptHeartbeat, TranscriptState } from "./ai-transcript.ts";

const DEBOUNCE_MS = 50;
const OFFLINE_FLUSH_MS = 5 * 60_000;
const AI_SYNC_MS = 60_000;

let output: vscode.OutputChannel;
let statusBar: StatusBar;
let sender: HeartbeatSender;
let queue: OfflineQueue;
let buffer: HeartbeatBuffer;
let lineTracker: LineChangeTracker;
let machineId = "";
let lastHeartbeatAt = 0;
let lastFile = "";
let lastAIGenerating = false;
let lastContext: StatusContext = { project: null, file: null, remote: false };
let debounceId: ReturnType<typeof setTimeout> | null = null;
let offlineTimer: ReturnType<typeof setInterval> | null = null;
let aiTimer: ReturnType<typeof setInterval> | null = null;
let transcriptState: TranscriptState = {};
let paused = false;
let ctx: vscode.ExtensionContext;

function cfg(): WakaConfig {
  return readConfig();
}

function log(msg: string): void {
  const config = cfg();
  if (config.debug && output) output.appendLine(new Date().toISOString() + " " + msg);
  writeLog("info", msg);
}

function storageDir(context: vscode.ExtensionContext): string {
  const envHome = process.env.WAKATIME_HOME;
  if (envHome) return path.join(envHome, ".wakatime");
  return path.join(context.globalStorageUri.fsPath);
}

function resolveMachineId(context: vscode.ExtensionContext, config: WakaConfig): string {
  const key = "wakaSelfhost.machineNameId";
  const existing = context.globalState.get<string>(key);
  if (existing) return existing;
  const host = config.hostname || os.hostname();
  const remote = vscode.env.remoteName ? "@" + vscode.env.remoteName : "";
  const id = crypto.createHash("sha256").update(host + remote + os.platform()).digest("hex").slice(0, 32);
  void context.globalState.update(key, id);
  return id;
}

function hashName(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 8);
}

function relativeEntity(filePath: string, rootDir: string | null, config: WakaConfig): string {
  if (config.hideProjectFolder && rootDir) {
    const rel = path.relative(rootDir, filePath);
    if (rel && !rel.startsWith("..")) return rel.replace(/\\/g, "/");
    return path.basename(filePath);
  }
  return filePath;
}

function buildHeartbeat(
  entityPath: string,
  languageId: string | null,
  lineCount: number | null,
  line: number | null,
  character: number | null,
  isWrite: boolean,
  category: string,
  entityType: string,
  workspaceRoot: string | null,
  transcript?: { time: number; lineChanges: number }
): QueuedHeartbeat | null {
  const config = cfg();
  if (!config.enabled || paused) return null;
  if (!isConfigured(config)) return null;

  const hasProject = hasProjectFileNear(entityPath);
  if (!shouldTrack(entityPath, hasProject, config)) return null;

  const info = detectProject(entityPath, { hideProjectNames: config.hideProjectNames === true, stopAtWorkspaceRoot: workspaceRoot });
  if (config.excludeUnknownProject && !info.project) return null;

  let entity = relativeEntity(entityPath, info.rootDir, config);
  if (shouldHideFile(entityPath, config)) {
    const ext = path.extname(entityPath);
    entity = hashName(entityPath) + ext;
  }

  const project = shouldHideProject(info.project, config) && info.project ? "hidden-" + hashName(info.project) : info.project;
  const branch = shouldHideBranch(info.branch, config) && info.branch ? "hidden-" + hashName(info.branch) : info.branch;

  const dependencies = shouldHideDependencies(config) ? [] : detectDependencies(info.rootDir);
  const changes = transcript ? { aiLineChanges: 0, humanLineChanges: 0 } : lineTracker.take(entityPath);

  const heartbeat: QueuedHeartbeat = {
    entity,
    type: entityType,
    category,
    time: Date.now() / 1000,
    project,
    branch,
    language: languageId ? normalizeLanguage(languageId) ?? normalizeLanguage(entityPath) : normalizeLanguage(entityPath),
    lines: lineCount,
    lineno: line,
    cursorpos: character,
    is_write: isWrite,
    project_root_count: info.rootCount,
    machine_name_id: machineId,
  };

  if (transcript) {
    heartbeat.time = transcript.time;
    if (transcript.lineChanges > 0) heartbeat.ai_line_changes = transcript.lineChanges;
  }

  if (dependencies.length > 0) heartbeat.dependencies = dependencies;
  if (!transcript && changes.aiLineChanges > 0) heartbeat.ai_line_changes = changes.aiLineChanges;
  if (changes.humanLineChanges > 0) heartbeat.human_line_changes = changes.humanLineChanges;

  lastContext = {
    project: info.project,
    file: config.hideFileNames === true ? path.extname(entityPath) : path.basename(entityPath),
    remote: Boolean(vscode.env.remoteName),
  };

  return heartbeat;
}

function workspaceRootFor(filePath: string): string | null {
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
  return folder ? folder.uri.fsPath : null;
}

function dispatch(heartbeat: QueuedHeartbeat, config: WakaConfig): void {
  if (!config.apiKey) {
    log("跳过：apiKey 未配置");
    return;
  }
  buffer.push(heartbeat);
}

function shouldSend(heartbeat: QueuedHeartbeat, config: WakaConfig): boolean {
  const now = Date.now();
  const gapMs = Math.max(0, config.heartbeatRateLimitSeconds) * 1000;
  const fileChanged = heartbeat.entity !== lastFile;
  const aiState = (heartbeat.ai_line_changes ?? 0) > 0;
  const stateChanged = aiState !== lastAIGenerating;

  if (heartbeat.is_write || fileChanged || stateChanged || gapMs === 0 || now - lastHeartbeatAt >= gapMs) {
    lastHeartbeatAt = now;
    lastFile = heartbeat.entity;
    lastAIGenerating = aiState;
    return true;
  }
  return false;
}

function emit(
  entityPath: string,
  languageId: string | null,
  lineCount: number | null,
  line: number | null,
  character: number | null,
  isWrite: boolean,
  category = "coding",
  entityType = "file"
): void {
  const config = cfg();
  if (!config.enabled || paused) return;
  const heartbeat = buildHeartbeat(entityPath, languageId, lineCount, line, character, isWrite, category, entityType, workspaceRootFor(entityPath));
  if (!heartbeat) return;
  if (!shouldSend(heartbeat, config)) return;
  dispatch(heartbeat, config);
  if (config.debug) log("心跳 " + path.basename(heartbeat.entity) + (isWrite ? " (write)" : ""));
}

function emitFromEditor(editor: vscode.TextEditor | undefined, isWrite: boolean): void {
  if (!editor || editor.document.uri.scheme !== "file") return;
  const pos = editor.selection.active;
  emit(editor.document.uri.fsPath, editor.document.languageId, editor.document.lineCount, pos.line + 1, pos.character, isWrite);
}

function schedule(isWrite: boolean): void {
  if (debounceId) clearTimeout(debounceId);
  debounceId = setTimeout(() => {
    debounceId = null;
    emitFromEditor(vscode.window.activeTextEditor, isWrite);
  }, DEBOUNCE_MS);
}

const TRANSCRIPT_STATE_KEY = "wakaSelfhost.transcriptState";

/** 把 AI 会话日志解析出的活动补发成心跳（不受 120s 节流限制，它们是历史事件） */
function emitTranscript(heartbeats: TranscriptHeartbeat[]): void {
  const config = cfg();
  if (config.syncAiDisabled) return;
  if (!config.apiKey) return;

  const excludes: RegExp[] = [];
  for (const pattern of config.excludeAi) {
    try {
      excludes.push(new RegExp(pattern));
    } catch {
      /* 非法模式忽略 */
    }
  }

  let emitted = 0;
  for (const item of heartbeats) {
    const normalized = item.entity.replace(/\\/g, "/");
    if (excludes.some((re) => re.test(normalized))) continue;

    const heartbeat = buildHeartbeat(
      item.entity,
      null,
      null,
      null,
      null,
      item.isWrite,
      "coding",
      "file",
      workspaceRootFor(item.entity),
      { time: item.time, lineChanges: item.lineChanges }
    );
    if (!heartbeat) continue;
    if (!heartbeat.project && item.project) heartbeat.project = item.project;
    buffer.push(heartbeat);
    emitted++;
  }
  if (emitted > 0) log("AI 会话补发 " + emitted + " 条心跳");
}

async function syncTranscripts(): Promise<void> {
  const config = cfg();
  if (config.syncAiDisabled || !config.enabled) return;

  try {
    const result = syncAllTranscripts(transcriptState, { home: os.homedir() });
    transcriptState = { ...transcriptState, ...result.newState };
    await ctx.globalState.update(TRANSCRIPT_STATE_KEY, transcriptState);
    if (result.filesTouched > 0 && config.debug) {
      log("扫描 AI 会话: " + result.filesTouched + " 个文件有更新，解析出 " + result.heartbeats.length + " 条活动");
    }
    if (result.heartbeats.length > 0) emitTranscript(result.heartbeats);
  } catch (err) {
    log("AI 会话扫描失败: " + (err instanceof Error ? err.message : String(err)));
  }
}

function registerEvents(subscriptions: vscode.Disposable[]): void {
  subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      const active = vscode.window.activeTextEditor;
      if (!active || e.document.uri.toString() !== active.document.uri.toString()) return;
      const now = Date.now();
      for (const change of e.contentChanges) {
        const added = change.text.split("\n").length - 1;
        if (added > 0) lineTracker.record(e.document.uri.fsPath, e.document.lineCount, now);
      }
      schedule(false);
    })
  );
  subscriptions.push(vscode.window.onDidChangeTextEditorSelection(() => schedule(false)));
  subscriptions.push(vscode.window.onDidChangeTextEditorVisibleRanges(() => schedule(false)));
  subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(() => schedule(false)));
  subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => emitFromEditor(editor, true)));
  subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.uri.scheme !== "file") return;
      const editor = vscode.window.activeTextEditor;
      const pos = editor?.document.uri.fsPath === doc.uri.fsPath ? editor.selection.active : null;
      emit(doc.uri.fsPath, doc.languageId, doc.lineCount, pos ? pos.line + 1 : null, pos ? pos.character : null, true);
    })
  );
  subscriptions.push(
    vscode.window.onDidChangeWindowState((state) => {
      if (state.focused) schedule(true);
    })
  );
  subscriptions.push(
    vscode.workspace.onDidChangeNotebookDocument((e) => {
      if (e.notebook.uri.scheme !== "file") return;
      emit(e.notebook.uri.fsPath, null, null, null, null, false, "coding", "file");
    })
  );
  subscriptions.push(
    vscode.workspace.onDidSaveNotebookDocument((doc) => {
      if (doc.uri.scheme !== "file") return;
      emit(doc.uri.fsPath, null, null, null, null, true, "coding", "file");
    })
  );
  subscriptions.push(
    vscode.window.onDidChangeActiveTerminal((terminal) => {
      if (!terminal) return;
      emit("Terminal", null, null, null, null, false, "building", "app");
    })
  );
  subscriptions.push(
    vscode.window.onDidOpenTerminal(() => {
      emit("Terminal", null, null, null, null, false, "building", "app");
    })
  );
}

function promptApiKey(): Thenable<string | undefined> {
  return vscode.window.showInputBox({
    title: "waka-selfhost API Key",
    prompt: "从服务端 设置 → API Keys 生成，写入 ~/.wakatime.cfg 的 api_key",
    password: true,
    ignoreFocusOut: true,
    value: cfg().apiKey,
  });
}

function registerCommands(context: vscode.ExtensionContext, subscriptions: vscode.Disposable[]): void {
  const reg = (id: string, handler: (...args: unknown[]) => unknown) => {
    subscriptions.push(vscode.commands.registerCommand(id, handler));
  };

  reg("wakaSelfhost.setup", async () => {
    const current = cfg();

    const url = await vscode.window.showInputBox({
      title: "waka-selfhost：服务端地址",
      prompt: "填到 /v1 结尾，例如 http://192.168.1.10:8800/v1",
      value: current.apiUrl || "http://localhost:8800/v1",
      ignoreFocusOut: true,
      validateInput: (v) => {
        const t = v.trim();
        if (!/^https?:\/\//.test(t)) return "必须以 http:// 或 https:// 开头";
        if (!/\/v1\/?$/.test(t)) return "必须以 /v1 结尾";
        return null;
      },
    });
    if (url === undefined) return;
    writeIniValue("api_url", url.trim().replace(/\/+$/, ""));

    const key = await vscode.window.showInputBox({
      title: "waka-selfhost：API Key",
      prompt: "在服务端「设置」页面生成，waka_ 开头",
      password: true,
      value: current.apiKey,
      ignoreFocusOut: true,
      validateInput: (v) => (v.trim().length < 8 ? "Key 看起来不完整" : null),
    });
    if (key === undefined) return;
    writeIniValue("api_key", key.trim());

    const next = cfg();
    statusBar.applyLayout(next);
    statusBar.start(next);
    void vscode.window.showInformationMessage("已保存到 " + configFilePath());
  });

  reg("wakaSelfhost.apikey", async () => {
    const value = await promptApiKey();
    if (value === undefined) return;
    writeIniValue("api_key", value.trim());
    void vscode.window.showInformationMessage("API Key 已保存到 " + configFilePath());
    void statusBar.refresh(cfg());
  });

  reg("wakaSelfhost.apiurl", async () => {
    const value = await vscode.window.showInputBox({
      title: "waka-selfhost API URL",
      prompt: "例如 http://192.168.1.10:8800/v1",
      value: cfg().apiUrl,
      ignoreFocusOut: true,
    });
    if (value === undefined) return;
    writeIniValue("api_url", value.trim());
    void vscode.window.showInformationMessage("API URL 已保存");
    void statusBar.refresh(cfg());
  });

  reg("wakaSelfhost.proxy", async () => {
    const value = await vscode.window.showInputBox({
      title: "代理",
      prompt: "http://host:port 或 https://user:pass@host:port，留空表示不使用代理",
      value: cfg().proxy,
      ignoreFocusOut: true,
    });
    if (value === undefined) return;
    writeIniValue("proxy", value.trim());
    void vscode.window.showInformationMessage(value.trim() ? "代理已设置" : "代理已清除");
  });

  reg("wakaSelfhost.debug", async () => {
    const config = cfg();
    writeIniValue("debug", config.debug ? "false" : "true");
    void vscode.window.showInformationMessage("调试模式: " + (config.debug ? "关" : "开"));
  });

  reg("wakaSelfhost.toggle", async () => {
    paused = !paused;
    void vscode.window.showInformationMessage(paused ? "统计已暂停" : "统计已恢复");
  });

  reg("wakaSelfhost.statusBarEnabled", async () => {
    const config = cfg();
    const next = !config.statusBarEnabled;
    writeIniValue("status_bar_enabled", next ? "true" : "false");
    statusBar.start(cfg());
    void vscode.window.showInformationMessage("状态栏: " + (next ? "开" : "关"));
  });

  reg("wakaSelfhost.statusBarCodingActivity", async () => {
    const config = cfg();
    const next = !config.statusBarCodingActivity;
    writeIniValue("status_bar_coding_activity", next ? "true" : "false");
    statusBar.start(cfg());
    void vscode.window.showInformationMessage("状态栏显示当前项目: " + (next ? "开" : "关"));
  });

  reg("wakaSelfhost.openDashboard", () => {
    const config = cfg();
    const base = config.apiUrl.replace(/\/v1$/, "");
    void vscode.env.openExternal(vscode.Uri.parse(base + "/today"));
  });

  reg("wakaSelfhost.configFile", async () => {
    const file = configFilePath();
    try {
      await fs.promises.access(file);
    } catch {
      writeIniValue("api_url", cfg().apiUrl);
    }
    void vscode.window.showTextDocument(vscode.Uri.file(file));
  });

  reg("wakaSelfhost.logFile", async () => {
    const file = currentLogPath();
    if (!file) {
      void vscode.window.showWarningMessage("日志文件未启用");
      return;
    }
    void vscode.window.showTextDocument(vscode.Uri.file(file));
  });

  reg("wakaSelfhost.diagnostics", async () => {
    await showDiagnostics(cfg(), queue, sender, output);
  });

  reg("wakaSelfhost.syncAI", async () => {
    await syncTranscripts();
    void vscode.window.showInformationMessage("已扫描 AI 会话日志");
  });

  reg("wakaSelfhost.flushOffline", async () => {
    const sent = await sender.flush(cfg());
    void vscode.window.showInformationMessage("已补传 " + sent + " 条心跳");
  });
}

export function activate(context: vscode.ExtensionContext): void {
  ctx = context;
  output = vscode.window.createOutputChannel("waka-selfhost");
  context.subscriptions.push(output);

  const config = cfg();
  initLogFile(config.logFile, config.debug);
  machineId = resolveMachineId(context, config);

  queue = new OfflineQueue(storageDir(context));
  sender = new HeartbeatSender(queue, log);
  lineTracker = new LineChangeTracker();
  buffer = new HeartbeatBuffer((items) => {
    void sender.send(cfg(), items).then((outcome) => {
      if (!outcome.ok) log("批次发送失败: " + outcome.message);
      void statusBar.refresh(cfg());
    });
  });
  statusBar = new StatusBar(log, () => lastContext);
  statusBar.applyLayout(config);
  statusBar.start(config);

  log("激活完成，机器标识 " + machineId + "，AI 扩展: " + (detectAIExtensions().join(", ") || "无"));
  if (vscode.env.remoteName) {
    log("远程环境: " + vscode.env.remoteName + "，请求将从远端机器发出，服务端地址需远端可达");
  }

  registerEvents(context.subscriptions);
  registerCommands(context, context.subscriptions);

  transcriptState = context.globalState.get<TranscriptState>(TRANSCRIPT_STATE_KEY) ?? {};
  void syncTranscripts();
  aiTimer = setInterval(() => void syncTranscripts(), AI_SYNC_MS);

  offlineTimer = setInterval(() => {
    const c = cfg();
    if (!c.offline) return;
    void sender.flush(c).then((sent) => {
      if (sent > 0) log("补传 " + sent + " 条心跳");
    });
  }, OFFLINE_FLUSH_MS);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("wakaSelfhost")) return;
      const next = cfg();
      statusBar.applyLayout(next);
      statusBar.start(next);
    })
  );

  emitFromEditor(vscode.window.activeTextEditor, true);
  void maybeOnboard(context);
}

/** 未配置时引导一次；检测到官方配置时说明两者互不影响 */
async function maybeOnboard(context: vscode.ExtensionContext): Promise<void> {
  const config = cfg();
  if (isConfigured(config)) return;

  const flagKey = "wakaSelfhost.onboarded";
  if (context.globalState.get<boolean>(flagKey)) return;
  await context.globalState.update(flagKey, true);

  const legacyHint = hasLegacyConfig()
    ? "\n检测到 ~/.wakatime.cfg 里有官方插件的配置。本扩展使用独立文件 ~/.waka-selfhost.cfg，两者互不影响。"
    : "";

  const pick = await vscode.window.showInformationMessage(
    "waka-selfhost 还没配置服务端地址和 API Key，现在无法上报。" + legacyHint,
    "立即配置",
    "稍后"
  );
  if (pick === "立即配置") void vscode.commands.executeCommand("wakaSelfhost.setup");
}

export function deactivate(): void {
  if (debounceId) clearTimeout(debounceId);
  if (offlineTimer) clearInterval(offlineTimer);
  if (aiTimer) clearInterval(aiTimer);
  buffer?.dispose();
  statusBar?.dispose();
}

