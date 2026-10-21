import zlib from "node:zlib";
import type { Ctx } from "./context.ts";
import { HttpError } from "./context.ts";

const COMPRESS_THRESHOLD = 1024;

function send(ctx: Ctx, status: number, body: string | Buffer, headers: Record<string, string>): void {
  const { res, req } = ctx;
  if (res.headersSent) return;
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8");
  const acceptsGzip = (req.headers["accept-encoding"] ?? "").toString().includes("gzip");
  const outHeaders: Record<string, string> = { ...headers };
  let payload = buf;
  if (acceptsGzip && buf.length > COMPRESS_THRESHOLD) {
    payload = zlib.gzipSync(buf);
    outHeaders["Content-Encoding"] = "gzip";
    outHeaders["Vary"] = "Accept-Encoding";
  }
  outHeaders["Content-Length"] = String(payload.length);
  res.writeHead(status, outHeaders);
  if (ctx.method === "HEAD") res.end();
  else res.end(payload);
}

export function json(ctx: Ctx, status: number, data: unknown, headers: Record<string, string> = {}): void {
  send(ctx, status, JSON.stringify(data), { "Content-Type": "application/json; charset=utf-8", ...headers });
}

export function ok(ctx: Ctx, data: unknown, headers: Record<string, string> = {}): void {
  json(ctx, 200, { data }, headers);
}

export function created(ctx: Ctx, data: unknown): void {
  json(ctx, 201, { data });
}

export function noContent(ctx: Ctx): void {
  const { res } = ctx;
  if (res.headersSent) return;
  res.writeHead(204);
  res.end();
}

export function html(ctx: Ctx, status: number, markup: string, headers: Record<string, string> = {}): void {
  send(ctx, status, markup, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", ...headers });
}

export function text(ctx: Ctx, status: number, body: string, contentType = "text/plain; charset=utf-8"): void {
  send(ctx, status, body, { "Content-Type": contentType });
}

export function redirect(ctx: Ctx, location: string, status = 302, headers: Record<string, string> = {}): void {
  const { res } = ctx;
  if (res.headersSent) return;
  res.writeHead(status, { Location: location, ...headers });
  res.end();
}

export function fail(ctx: Ctx, err: unknown): void {
  if (err instanceof HttpError) {
    json(ctx, err.status, { error: err.code, message: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  json(ctx, 500, { error: "server_error", message });
}

