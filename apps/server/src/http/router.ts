import type { Ctx } from "./context.ts";

export type Handler = (ctx: Ctx, params: Record<string, string>) => Promise<void> | void;

interface Compiled {
  method: string;
  segments: string[];
  handler: Handler;
  pattern: string;
}

export class Router {
  private routes: Compiled[] = [];

  add(method: string, pattern: string, handler: Handler): this {
    this.routes.push({
      method: method.toUpperCase(),
      segments: pattern.split("/").filter((s) => s.length > 0),
      handler,
      pattern,
    });
    return this;
  }

  get(pattern: string, handler: Handler): this {
    return this.add("GET", pattern, handler);
  }

  post(pattern: string, handler: Handler): this {
    return this.add("POST", pattern, handler);
  }

  patch(pattern: string, handler: Handler): this {
    return this.add("PATCH", pattern, handler);
  }

  delete(pattern: string, handler: Handler): this {
    return this.add("DELETE", pattern, handler);
  }

  match(method: string, pathname: string): { handler: Handler; params: Record<string, string> } | null {
    const parts = pathname.split("/").filter((s) => s.length > 0);
    // HTTP 规范：HEAD 应返回与 GET 相同的头，所以复用 GET 路由
    const raw = method.toUpperCase();
    const upper = raw === "HEAD" ? "GET" : raw;
    for (const r of this.routes) {
      if (r.method !== upper) continue;
      if (r.segments.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < r.segments.length; i++) {
        const seg = r.segments[i];
        if (seg.startsWith(":")) params[seg.slice(1)] = decodeURIComponent(parts[i]);
        else if (seg !== parts[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return { handler: r.handler, params };
    }
    return null;
  }

  hasPath(pathname: string): boolean {
    const parts = pathname.split("/").filter((s) => s.length > 0);
    for (const r of this.routes) {
      if (r.segments.length !== parts.length) continue;
      let ok = true;
      for (let i = 0; i < r.segments.length; i++) {
        const seg = r.segments[i];
        if (!seg.startsWith(":") && seg !== parts[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return true;
    }
    return false;
  }

  list(): { method: string; pattern: string }[] {
    return this.routes.map((r) => ({ method: r.method, pattern: r.pattern }));
  }
}

