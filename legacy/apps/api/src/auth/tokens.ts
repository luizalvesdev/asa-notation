import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function mac(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function signToken(payload: { exp: number } & Record<string, unknown>, secret: string): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${mac(data, secret)}`;
}

export function verifyToken<T extends { exp: number }>(
  token: string | undefined,
  secret: string,
  nowSeconds: number,
): T | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [data, signature] = parts as [string, string];
  const expected = Buffer.from(mac(data, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as T;
    if (typeof payload.exp !== "number" || payload.exp <= nowSeconds) return null;
    return payload;
  } catch {
    return null;
  }
}

export function safeEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newDeviceToken(): { token: string; hash: string } {
  const token = `asa_${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashDeviceToken(token) };
}

export function serializeCookie(
  name: string,
  value: string,
  opts: { maxAge: number; secure: boolean },
): string {
  const parts = [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${opts.maxAge}`];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}
