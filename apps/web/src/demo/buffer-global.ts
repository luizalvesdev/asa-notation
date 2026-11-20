// O código da API usa o `Buffer` global do Node; no navegador ele vem do pacote `buffer`,
// que não conhece "base64url". Aqui ele aprende: converte de/para base64 comum.
import { Buffer } from "buffer";

const toUrl = (b64: string) => b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromUrl = (text: string) => text.replace(/-/g, "+").replace(/_/g, "/");

const proto = Buffer.prototype as unknown as { toString: (enc?: string, start?: number, end?: number) => string };
const originalToString = proto.toString;
proto.toString = function (this: Buffer, enc?: string, start?: number, end?: number) {
  if (enc === "base64url") return toUrl(originalToString.call(this, "base64", start, end));
  return originalToString.call(this, enc, start, end);
};

const B = Buffer as unknown as { from: (value: unknown, enc?: unknown, length?: unknown) => Buffer };
const originalFrom = B.from.bind(Buffer);
B.from = (value: unknown, enc?: unknown, length?: unknown) =>
  typeof value === "string" && enc === "base64url" ? originalFrom(fromUrl(value), "base64") : originalFrom(value, enc, length);

const g = globalThis as unknown as { Buffer?: typeof Buffer };
g.Buffer ??= Buffer;
