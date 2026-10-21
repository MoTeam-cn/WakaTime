import crypto from "node:crypto";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

/** scrypt$N$r$p$salt$hash */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return ["scrypt", SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString("base64"), hash.toString("base64")].join("$");
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  let actual: Buffer;
  try {
    actual = crypto.scryptSync(password, salt, expected.length, { N: n, r, p });
  } catch {
    return false;
  }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export interface AccessTokenPayload {
  sub: string;
  username: string;
  role: string;
  jti: string;
  iat: number;
  exp: number;
  typ: "access";
}

export function signAccessToken(
  input: { userId: string; username: string; role: string; ttl: number },
  secret: string
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: AccessTokenPayload = {
    sub: input.userId,
    username: input.username,
    role: input.role,
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + input.ttl,
    typ: "access",
  };
  const header = b64url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(crypto.createHmac("sha256", secret).update(header + "." + body).digest());
  return header + "." + body + "." + sig;
}

export function verifyAccessToken(token: string, secret: string): AccessTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = b64url(crypto.createHmac("sha256", secret).update(header + "." + body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload: AccessTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AccessTokenPayload;
  } catch {
    return null;
  }
  if (payload.typ !== "access") return null;
  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export function looksLikeJwt(token: string): boolean {
  return token.split(".").length === 3;
}

const KEY_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** 生成 waka_ 前缀的 API Key，返回明文、前缀与哈希（明文只出现一次） */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const bytes = crypto.randomBytes(32);
  let body = "";
  for (let i = 0; i < bytes.length; i++) body += KEY_ALPHABET[bytes[i] % KEY_ALPHABET.length];
  const key = "waka_" + body;
  return { key, prefix: key.slice(0, 13), hash: sha256Hex(key) };
}

export function generateRefreshToken(): { token: string; hash: string } {
  const token = "rt_" + crypto.randomBytes(32).toString("base64url");
  return { token, hash: sha256Hex(token) };
}

export function passwordPolicyError(password: string, username: string): string | null {
  if (typeof password !== "string" || password.length < 10) return "密码至少 10 位";
  if (password.length > 200) return "密码过长";
  if (password.toLowerCase() === username.toLowerCase()) return "密码不能与用户名相同";
  return null;
}

