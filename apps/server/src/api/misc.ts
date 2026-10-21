import os from "node:os";
import type { AppState } from "../app.ts";
import type { Ctx } from "../http/context.ts";
import { notImplemented } from "../http/context.ts";
import { ok } from "../http/respond.ts";

export const VERSION = "0.1.0";

export function healthHandler(state: AppState) {
  return async (ctx: Ctx): Promise<void> => {
    ok(ctx, {
      status: "ok",
      version: state.config.appVersion,
      uptime_seconds: Math.floor((Date.now() - state.startedAt) / 1000),
    });
  };
}

export function pluginsHandler() {
  return async (ctx: Ctx): Promise<void> => {
    ok(ctx, [
      {
        id: "vscode",
        name: "Visual Studio Code",
        version: "30.2.1",
        released: true,
        hidden: false,
        history_url: "https://wakatime.com/changelog",
        url: "https://marketplace.visualstudio.com/items?itemName=WakaTime.vscode-wakatime",
      },
      {
        id: "vscode-wakatime",
        name: "Visual Studio Code",
        version: "30.2.1",
        released: true,
        hidden: false,
        history_url: "https://wakatime.com/changelog",
        url: "https://marketplace.visualstudio.com/items?itemName=WakaTime.vscode-wakatime",
      },
    ]);
  };
}

export function metaHandler(state: AppState) {
  return async (ctx: Ctx): Promise<void> => {
    ok(ctx, {
      hostname: os.hostname(),
      version: VERSION,
      server_time: new Date().toISOString(),
      timezone: state.config.defaultTimezone,
    });
  };
}

const NOT_IMPLEMENTED: { method: string; pattern: string }[] = [
  { method: "GET", pattern: "/v1/users/:username/goals" },
  { method: "GET", pattern: "/v1/users/:username/custom_rules" },
  { method: "GET", pattern: "/v1/users/:username/leaderboards" },
  { method: "GET", pattern: "/v1/users/:username/orgs" },
  { method: "GET", pattern: "/v1/users/:username/data_dumps" },
  { method: "GET", pattern: "/v1/users/:username/file_experts" },
  { method: "GET", pattern: "/v1/users/:username/external_durations" },
  { method: "GET", pattern: "/v1/users/:username/insights/:type/:range" },
  { method: "GET", pattern: "/v1/users/:username/projects/:project/commits" },
];

export function registerNotImplemented(state: AppState): void {
  for (const route of NOT_IMPLEMENTED) {
    state.router.add(route.method, route.pattern, async () => {
      throw notImplemented("该 WakaTime 端点在本项目中未实现：" + route.pattern);
    });
  }
}

