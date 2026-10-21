import type { Heartbeat } from "../src/types.ts";

export function hb(partial: Partial<Heartbeat> & { time: number }): Heartbeat {
  return {
    entity: partial.entity ?? "/p/a.ts",
    type: partial.type ?? "file",
    category: partial.category ?? "coding",
    time: partial.time,
    project: partial.project === undefined ? "proj" : partial.project,
    projectRootCount: null,
    branch: partial.branch === undefined ? "main" : partial.branch,
    language: partial.language === undefined ? "TypeScript" : partial.language,
    dependencies: null,
    lines: null,
    lineno: null,
    cursorpos: null,
    isWrite: partial.isWrite ?? false,
    machineNameId: partial.machineNameId ?? null,
    userAgent: null,
    editor: partial.editor === undefined ? "vscode" : partial.editor,
    os: partial.os === undefined ? "windows" : partial.os,
    aiLineChanges: null,
    humanLineChanges: null,
    aiSession: null,
    aiInputTokens: null,
    aiOutputTokens: null,
    aiPromptLength: null,
    aiSubscriptionPlan: null,
  };
}

export const T0 = Date.UTC(2026, 9, 20, 2, 0, 0) / 1000;

