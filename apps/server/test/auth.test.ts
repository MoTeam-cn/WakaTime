import test from "node:test";
import assert from "node:assert/strict";
import {
  generateApiKey,
  generateRefreshToken,
  hashPassword,
  looksLikeJwt,
  passwordPolicyError,
  sha256Hex,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
} from "../src/service/auth.ts";

test("密码哈希可验证且不泄露明文", () => {
  const hash = hashPassword("supersecret123");
  assert.ok(hash.startsWith("scrypt$16384$8$1$"));
  assert.ok(!hash.includes("supersecret123"));
  assert.equal(verifyPassword("supersecret123", hash), true);
  assert.equal(verifyPassword("supersecret124", hash), false);
});

test("同一密码两次哈希不同（加盐）", () => {
  assert.notEqual(hashPassword("supersecret123"), hashPassword("supersecret123"));
});

test("JWT 签发与校验", () => {
  const secret = "test-secret";
  const token = signAccessToken({ userId: "u1", username: "xiaomo", role: "admin", ttl: 60 }, secret);
  assert.equal(token.split(".").length, 3);
  const payload = verifyAccessToken(token, secret);
  assert.equal(payload?.sub, "u1");
  assert.equal(payload?.role, "admin");
  assert.equal(verifyAccessToken(token, "other-secret"), null);
  assert.equal(verifyAccessToken(token + "x", secret), null);
});

test("过期 JWT 拒绝", () => {
  const token = signAccessToken({ userId: "u1", username: "a", role: "member", ttl: -10 }, "s");
  assert.equal(verifyAccessToken(token, "s"), null);
});

test("API Key 形态与哈希", () => {
  const key = generateApiKey();
  assert.ok(key.key.startsWith("waka_"));
  assert.equal(key.key.length, 5 + 32);
  assert.equal(key.hash, sha256Hex(key.key));
  assert.equal(key.prefix, key.key.slice(0, 13));
  assert.equal(generateApiKey().key === key.key, false);
});

test("refresh token 形态", () => {
  const rt = generateRefreshToken();
  assert.ok(rt.token.startsWith("rt_"));
  assert.equal(rt.hash, sha256Hex(rt.token));
});

test("密码策略", () => {
  assert.equal(passwordPolicyError("short", "xiaomo"), "密码至少 10 位");
  assert.equal(passwordPolicyError("xiaomoxiaomo", "xiaomoxiaomo"), "密码不能与用户名相同");
  assert.equal(passwordPolicyError("supersecret123", "xiaomo"), null);
});

test("looksLikeJwt 区分 API Key", () => {
  assert.equal(looksLikeJwt("a.b.c"), true);
  assert.equal(looksLikeJwt("waka_abcdef"), false);
});

