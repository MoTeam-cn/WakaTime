import type { IncomingMessage } from "node:http";
import type { Db } from "../store/db.ts";
import type { AuthContext } from "./context.ts";
import { findKeyByHash, touchKey } from "../store/keys.ts";
import { findUserById } from "../store/users.ts";
import { looksLikeJwt, sha256Hex, verifyAccessToken } from "../service/auth.ts";

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function fromApiKey(db: Db, rawKey: string): AuthContext | null {
  const row = findKeyByHash(db, sha256Hex(rawKey));
  if (!row) return null;
  if (row.revokedAt !== null) return null;
  if (row.disabled) return null;
  touchKey(db, row.id);
  return {
    userId: row.userId,
    username: "",
    role: row.role as AuthContext["role"],
    timezone: row.timezone,
    via: "api_key",
    keyId: row.id,
  };
}

function fromJwt(db: Db, token: string, secret: string, via: "jwt" | "cookie"): AuthContext | null {
  const payload = verifyAccessToken(token, secret);
  if (!payload) return null;
  const user = findUserById(db, payload.sub);
  if (!user || user.disabled) return null;
  return {
    userId: user.id,
    username: user.username,
    role: user.role,
    timezone: user.timezone,
    via,
    keyId: null,
  };
}

/**
 * 解析身份。顺序：Bearer(JWT) → Bearer(API Key) → Basic(API Key) → ?api_key= → Cookie。
 * Bearer 若是三段点分则按 JWT 校验，失败即返回 null（不回退），避免歧义。
 */
export function authenticate(
  req: IncomingMessage,
  url: URL,
  db: Db,
  jwtSecret: string
): AuthContext | null {
  const authHeader = (req.headers.authorization ?? "").toString().trim();

  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token.length === 0) return null;
    if (looksLikeJwt(token)) return fromJwt(db, token, jwtSecret, "jwt");
    return fromApiKey(db, token);
  }

  if (authHeader.toLowerCase().startsWith("basic ")) {
    const encoded = authHeader.slice(6).trim();
    let decoded = "";
    try {
      decoded = Buffer.from(encoded, "base64").toString("utf8");
    } catch {
      return null;
    }
    const key = decoded.includes(":") ? decoded.slice(0, decoded.indexOf(":")) : decoded;
    const trimmed = key.trim();
    if (trimmed.length === 0) return null;
    return fromApiKey(db, trimmed);
  }

  const apiKeyParam = url.searchParams.get("api_key") ?? url.searchParams.get("token");
  if (apiKeyParam) return fromApiKey(db, apiKeyParam);

  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies["waka_at"];
  if (cookieToken) return fromJwt(db, cookieToken, jwtSecret, "cookie");

  return null;
}

