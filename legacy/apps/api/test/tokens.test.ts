import { describe, expect, it } from "vitest";
import {
  hashDeviceToken,
  newDeviceToken,
  safeEqual,
  serializeCookie,
  signToken,
  verifyToken,
} from "../src/auth/tokens.js";

const SECRET = "k".repeat(40);

describe("signed tokens", () => {
  it("round-trips a payload", () => {
    const token = signToken({ typ: "x", exp: 200 }, SECRET);
    expect(verifyToken<{ typ: string; exp: number }>(token, SECRET, 100)).toEqual({ typ: "x", exp: 200 });
  });

  it("rejects an expired token, including the exact expiry second", () => {
    const token = signToken({ exp: 200 }, SECRET);
    expect(verifyToken(token, SECRET, 200)).toBeNull();
    expect(verifyToken(token, SECRET, 201)).toBeNull();
  });

  it("rejects the wrong secret, a tampered payload and malformed input", () => {
    const token = signToken({ exp: 200 }, SECRET);
    expect(verifyToken(token, "other".repeat(10), 100)).toBeNull();
    const [data, sig] = token.split(".") as [string, string];
    const forged = Buffer.from(JSON.stringify({ exp: 9_999_999 })).toString("base64url");
    expect(verifyToken(`${forged}.${sig}`, SECRET, 100)).toBeNull();
    expect(verifyToken(`${data}.${sig}.extra`, SECRET, 100)).toBeNull();
    expect(verifyToken(data, SECRET, 100)).toBeNull();
    expect(verifyToken("", SECRET, 100)).toBeNull();
    expect(verifyToken(undefined, SECRET, 100)).toBeNull();
  });

  it("rejects a payload without a numeric exp", () => {
    const data = Buffer.from(JSON.stringify({ a: 1 })).toString("base64url");
    const token = signToken({ exp: 1 }, SECRET).replace(/^[^.]+/, data);
    expect(verifyToken(token, SECRET, 0)).toBeNull();
  });
});

describe("device tokens", () => {
  it("generates unique tokens whose hash matches", () => {
    const a = newDeviceToken();
    const b = newDeviceToken();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(hashDeviceToken(a.token));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("helpers", () => {
  it("safeEqual compares strings of different lengths", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("serializes cookies with the security attributes", () => {
    expect(serializeCookie("a", "b", { maxAge: 10, secure: true })).toBe(
      "a=b; Path=/; HttpOnly; SameSite=Strict; Max-Age=10; Secure",
    );
    expect(serializeCookie("a", "b", { maxAge: 10, secure: false })).not.toContain("Secure");
  });
});
