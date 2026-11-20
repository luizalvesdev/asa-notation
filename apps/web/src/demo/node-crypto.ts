// Substitui o `node:crypto` no build da demo: a API roda dentro do navegador e só precisa destas funções.
// Push (ECDH, chaves VAPID) não existe na demo: essas funções falham de propósito.
import "./buffer-global";
import { Buffer } from "buffer";
import { gcm } from "@noble/ciphers/aes.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { sha256 } from "@noble/hashes/sha2.js";

type Data = string | Uint8Array;
const bytes = (d: Data): Uint8Array => (typeof d === "string" ? new TextEncoder().encode(d) : d);
const out = (b: Uint8Array, enc?: string) => (enc ? Buffer.from(b).toString(enc as BufferEncoding) : Buffer.from(b));

function onlySha256(alg: string) {
  if (alg !== "sha256") throw new Error(`demo: ${alg} not supported`);
}

export function randomBytes(n: number): Buffer {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(n)));
}

export function createHash(alg: string) {
  onlySha256(alg);
  const h = sha256.create();
  const api = {
    update(d: Data) {
      h.update(bytes(d));
      return api;
    },
    digest: (enc?: string) => out(h.digest(), enc),
  };
  return api;
}

export function createHmac(alg: string, key: Data) {
  onlySha256(alg);
  const h = hmac.create(sha256, bytes(key));
  const api = {
    update(d: Data) {
      h.update(bytes(d));
      return api;
    },
    digest: (enc?: string) => out(h.digest(), enc),
  };
  return api;
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) throw new RangeError("Input buffers must have the same byte length");
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export function hkdfSync(alg: string, ikm: Data, salt: Data, info: Data, length: number): ArrayBuffer {
  onlySha256(alg);
  return hkdf(sha256, bytes(ikm), bytes(salt), bytes(info), length).slice().buffer;
}

export function scrypt(password: Data, salt: Data, keylen: number, opts: { N: number; r: number; p: number }, cb: (err: Error | null, key: Buffer) => void): void {
  scryptAsync(bytes(password), bytes(salt), { N: opts.N, r: opts.r, p: opts.p, dkLen: keylen }).then(
    (key) => cb(null, Buffer.from(key)),
    (err: Error) => cb(err, Buffer.alloc(0)),
  );
}

const concat = (parts: Uint8Array[]) => Buffer.concat(parts.map((p) => Buffer.from(p)));

/** AES-256-GCM em uma tacada só: `update` junta os pedaços e `final` cifra tudo (quem chama concatena os dois). */
export function createCipheriv(alg: string, key: Uint8Array, iv: Uint8Array) {
  if (alg !== "aes-256-gcm") throw new Error(`demo: ${alg} not supported`);
  const parts: Uint8Array[] = [];
  let tag = Buffer.alloc(0);
  return {
    update(d: Data) {
      parts.push(bytes(d));
      return Buffer.alloc(0);
    },
    final() {
      const sealed = gcm(key, iv).encrypt(concat(parts));
      tag = Buffer.from(sealed.subarray(sealed.length - 16));
      return Buffer.from(sealed.subarray(0, sealed.length - 16));
    },
    getAuthTag: () => tag,
  };
}

export function createDecipheriv(alg: string, key: Uint8Array, iv: Uint8Array) {
  if (alg !== "aes-256-gcm") throw new Error(`demo: ${alg} not supported`);
  const parts: Uint8Array[] = [];
  let tag: Uint8Array = new Uint8Array(0);
  return {
    setAuthTag(t: Uint8Array) {
      tag = t;
    },
    update(d: Data) {
      parts.push(bytes(d));
      return Buffer.alloc(0);
    },
    final: () => Buffer.from(gcm(key, iv).decrypt(concat([...parts, tag]))),
  };
}

const noPush = () => {
  throw new Error("push is not available in the demo");
};
export const createECDH = noPush;
export const createPrivateKey = noPush;
export const generateKeyPairSync = noPush;
export const sign = noPush;

export default { randomBytes, createHash, createHmac, timingSafeEqual, hkdfSync, scrypt, createCipheriv, createDecipheriv, createECDH, createPrivateKey, generateKeyPairSync, sign };
