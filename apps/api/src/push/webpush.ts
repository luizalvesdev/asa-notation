import { createECDH, createPrivateKey, createCipheriv, generateKeyPairSync, hkdfSync, randomBytes, sign } from "node:crypto";

/**
 * Web Push sem dependências: criptografia do conteúdo (RFC 8291, aes128gcm)
 * e identificação do servidor por VAPID (RFC 8292).
 */

export interface VapidKeys {
  /** Ponto público P-256 sem compressão (65 bytes), em base64url: é o `applicationServerKey` do navegador. */
  publicKey: string;
  /** Escalar privado (32 bytes), em base64url. */
  privateKey: string;
}

export interface PushSubscriptionKeys {
  endpoint: string;
  /** Chave pública do navegador (65 bytes), base64url. */
  p256dh: string;
  /** Segredo de autenticação do navegador (16 bytes), base64url. */
  auth: string;
}

export type PushFetch = (url: string, init: { method: string; headers: Record<string, string>; body: Uint8Array }) => Promise<{ status: number }>;

const b64url = (buf: Uint8Array) => Buffer.from(buf).toString("base64url");
const fromB64url = (text: string) => Buffer.from(text, "base64url");

export function generateVapidKeys(): VapidKeys {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.concat([Buffer.from([4]), fromB64url(jwk.x!), fromB64url(jwk.y!)]);
  return { publicKey: b64url(pub), privateKey: jwk.d! };
}

/** Cabeçalho Authorization com o JWT assinado (ES256) para a origem do endpoint. */
export function vapidAuthorization(endpoint: string, subject: string, keys: VapidKeys, nowSec: number): string {
  const pub = fromB64url(keys.publicKey);
  const key = createPrivateKey({
    format: "jwk",
    key: { kty: "EC", crv: "P-256", d: keys.privateKey, x: b64url(pub.subarray(1, 33)), y: b64url(pub.subarray(33, 65)) },
  });
  const header = b64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  // 12 h: o máximo aceito pelos serviços é 24 h.
  const claims = b64url(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSec + 12 * 3600, sub: subject })));
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${keys.publicKey}`;
}

const RECORD_SIZE = 4096;

/** Cifra o conteúdo para um navegador (um único registro aes128gcm). */
export function encryptPayload(plaintext: Uint8Array, p256dh: string, auth: string, salt: Uint8Array = randomBytes(16)): Buffer {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const uaPublic = fromB64url(p256dh);
  const authSecret = fromB64url(auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error("invalid p256dh");
  if (authSecret.length !== 16) throw new Error("invalid auth");
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, authSecret, keyInfo, 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));

  // 0x02 marca o último (e único) registro, sem preenchimento.
  const padded = Buffer.concat([Buffer.from(plaintext), Buffer.from([2])]);
  if (padded.length + 16 > RECORD_SIZE) throw new Error("payload too large");
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(padded), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(RECORD_SIZE);
  return Buffer.concat([Buffer.from(salt), rs, Buffer.from([asPublic.length]), asPublic, body]);
}

// Só os serviços de push dos navegadores: o servidor nunca manda requisições para endereços arbitrários.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];

export function isPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.port === "" && url.username === "" && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}

export function isKey(value: unknown, bytes: number): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]+={0,2}$/.test(value) && fromB64url(value).length === bytes;
}

/** Envia uma mensagem. Devolve o status HTTP do serviço de push (201 = aceita; 404/410 = inscrição morta). */
export async function sendPush(fetchImpl: PushFetch, sub: PushSubscriptionKeys, payload: unknown, keys: VapidKeys, subject: string, nowMs: number): Promise<number> {
  const body = encryptPayload(Buffer.from(JSON.stringify(payload)), sub.p256dh, sub.auth);
  const res = await fetchImpl(sub.endpoint, {
    method: "POST",
    headers: {
      authorization: vapidAuthorization(sub.endpoint, subject, keys, Math.floor(nowMs / 1000)),
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: String(24 * 3600),
      urgency: "normal",
    },
    body,
  });
  return res.status;
}
