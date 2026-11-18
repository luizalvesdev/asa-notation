import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";

const sha256 = (data: Uint8Array | string) => createHash("sha256").update(data).digest();
const b64u = (data: Uint8Array) => Buffer.from(data).toString("base64url");

function head(major: number, n: number): Buffer {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 256) return Buffer.from([(major << 5) | 24, n]);
  return Buffer.from([(major << 5) | 25, n >> 8, n & 255]);
}

type Cbor = number | string | Uint8Array | Map<Cbor, Cbor>;

function cbor(value: Cbor): Buffer {
  if (typeof value === "number") return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (typeof value === "string") {
    const bytes = Buffer.from(value);
    return Buffer.concat([head(3, bytes.length), bytes]);
  }
  if (value instanceof Uint8Array) return Buffer.concat([head(2, value.length), value]);
  const parts: Buffer[] = [head(5, value.size)];
  for (const [k, v] of value) parts.push(cbor(k), cbor(v));
  return Buffer.concat(parts);
}

function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}

function u16(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
}

export class SoftAuthenticator {
  readonly credentialId = randomBytes(32);
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;

  constructor(keys = generateKeyPairSync("ec", { namedCurve: "P-256" })) {
    this.privateKey = keys.privateKey;
    this.publicKey = keys.publicKey;
  }

  get id(): string {
    return b64u(this.credentialId);
  }

  private coseKey(): Buffer {
    const jwk = this.publicKey.export({ format: "jwk" });
    return cbor(
      new Map<Cbor, Cbor>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, Buffer.from(jwk.x!, "base64url")],
        [-3, Buffer.from(jwk.y!, "base64url")],
      ]),
    );
  }

  register(opts: { challenge: string; origin: string; rpId: string; userVerified?: boolean }) {
    const uv = opts.userVerified ?? true;
    const flags = 0x01 | (uv ? 0x04 : 0) | 0x40;
    const authData = Buffer.concat([
      sha256(opts.rpId),
      Buffer.from([flags]),
      u32(0),
      Buffer.alloc(16),
      u16(this.credentialId.length),
      this.credentialId,
      this.coseKey(),
    ]);
    const attestationObject = cbor(
      new Map<Cbor, Cbor>([
        ["fmt", "none"],
        ["attStmt", new Map<Cbor, Cbor>()],
        ["authData", authData],
      ]),
    );
    const clientDataJSON = Buffer.from(
      JSON.stringify({ type: "webauthn.create", challenge: opts.challenge, origin: opts.origin, crossOrigin: false }),
    );
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key",
      response: { clientDataJSON: b64u(clientDataJSON), attestationObject: b64u(attestationObject), transports: ["internal"] },
      clientExtensionResults: {},
    };
  }

  assert(opts: { challenge: string; origin: string; rpId: string; counter: number; userVerified?: boolean }) {
    const uv = opts.userVerified ?? true;
    const authData = Buffer.concat([sha256(opts.rpId), Buffer.from([0x01 | (uv ? 0x04 : 0)]), u32(opts.counter)]);
    const clientDataJSON = Buffer.from(
      JSON.stringify({ type: "webauthn.get", challenge: opts.challenge, origin: opts.origin, crossOrigin: false }),
    );
    const signature = sign("sha256", Buffer.concat([authData, sha256(clientDataJSON)]), this.privateKey);
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key",
      response: {
        clientDataJSON: b64u(clientDataJSON),
        authenticatorData: b64u(authData),
        signature: b64u(signature),
      },
      clientExtensionResults: {},
    };
  }
}
