import type { IncomingMessage, ServerResponse } from "node:http";

export type Role = "admin" | "member";

export interface AuthContext {
  userId: string;
  username: string;
  role: Role;
  timezone: string;
  via: "jwt" | "api_key" | "cookie";
  keyId: string | null;
}

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  auth: AuthContext | null;
  body: unknown;
  ip: string;
  userAgent: string | null;
}

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export function badRequest(message: string, code = "invalid_request"): HttpError {
  return new HttpError(400, code, message);
}

export function unauthorized(message = "未认证或凭据无效"): HttpError {
  return new HttpError(401, "unauthorized", message);
}

export function forbidden(message = "无权访问"): HttpError {
  return new HttpError(403, "forbidden", message);
}

export function notFound(message = "资源不存在"): HttpError {
  return new HttpError(404, "not_found", message);
}

export function conflict(message: string, code = "conflict"): HttpError {
  return new HttpError(409, code, message);
}

export function notImplemented(message = "该端点未实现"): HttpError {
  return new HttpError(404, "not_implemented", message);
}

