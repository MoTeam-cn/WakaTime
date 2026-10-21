import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import { URL } from "node:url";

export interface HttpOptions {
  proxy?: string;
  timeoutMs?: number;
  noSslVerify?: boolean;
}

export interface HttpResult {
  status: number;
  text: string;
}

function parseProxy(proxy: string): { host: string; port: number; auth: string | null } | null {
  if (!proxy) return null;
  const withScheme = proxy.includes("://") ? proxy : "http://" + proxy;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const auth = u.username ? Buffer.from(decodeURIComponent(u.username) + ":" + decodeURIComponent(u.password)).toString("base64") : null;
    return { host: u.hostname, port: Number(u.port || (u.protocol === "https:" ? 443 : 80)), auth };
  } catch {
    return null;
  }
}

function viaProxy(
  method: string,
  target: URL,
  body: string | undefined,
  headers: Record<string, string>,
  proxy: { host: string; port: number; auth: string | null },
  opts: HttpOptions
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const isHttps = target.protocol === "https:";
    const targetPort = Number(target.port || (isHttps ? 443 : 80));
    const connectHeaders: Record<string, string> = { host: target.hostname + ":" + targetPort };
    if (proxy.auth) connectHeaders["proxy-authorization"] = "Basic " + proxy.auth;

    const connectReq = http.request({
      host: proxy.host,
      port: proxy.port,
      method: "CONNECT",
      path: target.hostname + ":" + targetPort,
      headers: connectHeaders,
      timeout: opts.timeoutMs ?? 30000,
    });

    connectReq.on("connect", (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        reject(new Error("代理 CONNECT 失败: " + res.statusCode));
        return;
      }
      const finalSocket = isHttps
        ? tls.connect({ socket, servername: target.hostname, rejectUnauthorized: !opts.noSslVerify })
        : socket;

      const requestFn = isHttps ? https.request : http.request;
      const req = requestFn({
        method,
        host: target.hostname,
        port: targetPort,
        path: target.pathname + target.search,
        headers,
        createConnection: () => finalSocket,
        timeout: opts.timeoutMs ?? 30000,
      } as https.RequestOptions, (res2) => {
        const chunks: Buffer[] = [];
        res2.on("data", (c: Buffer) => chunks.push(c));
        res2.on("end", () => resolve({ status: res2.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
      });
      req.on("error", reject);
      req.on("timeout", () => { req.destroy(new Error("请求超时")); });
      if (body !== undefined) req.write(body);
      req.end();
    });

    connectReq.on("error", reject);
    connectReq.on("timeout", () => { connectReq.destroy(new Error("代理连接超时")); });
    connectReq.end();
  });
}

/** 统一的 HTTP 请求入口：无代理走 fetch，有 HTTP 代理走 CONNECT 隧道 */
export async function requestJson(
  method: string,
  urlStr: string,
  body: string | undefined,
  headers: Record<string, string>,
  opts: HttpOptions = {}
): Promise<HttpResult> {
  const target = new URL(urlStr);
  const proxy = parseProxy(opts.proxy ?? "");

  if (opts.proxy && !proxy) {
    throw new Error("仅支持 http/https 代理，当前配置: " + opts.proxy);
  }

  if (proxy) {
    return viaProxy(method, target, body, headers, proxy, opts);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30000);
  try {
    const res = await fetch(urlStr, { method, headers, body, signal: controller.signal });
    const text = await res.text();
    return { status: res.status, text };
  } finally {
    clearTimeout(timer);
  }
}

