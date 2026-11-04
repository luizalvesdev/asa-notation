import { randomUUID } from "node:crypto";
import type {
  AuthStore,
  DeviceScope,
  DeviceTokenInfo,
  NewPasskey,
  StoredPasskey,
} from "./store.js";

interface TokenRecord extends DeviceTokenInfo {
  tokenHash: string;
}

export class InMemoryAuthStore implements AuthStore {
  private passkeys: StoredPasskey[] = [];
  private tokens: TokenRecord[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  async listPasskeys(): Promise<StoredPasskey[]> {
    return this.passkeys.map((p) => ({ ...p }));
  }

  async addPasskey(passkey: NewPasskey): Promise<StoredPasskey> {
    if (this.passkeys.some((p) => p.credentialId === passkey.credentialId)) {
      throw new Error("duplicate credential");
    }
    const stored: StoredPasskey = { id: randomUUID(), createdAt: this.now().toISOString(), ...passkey };
    this.passkeys.push(stored);
    return { ...stored };
  }

  async updatePasskeyCounter(credentialId: string, counter: number): Promise<void> {
    const found = this.passkeys.find((p) => p.credentialId === credentialId);
    if (found) found.counter = counter;
  }

  async createDeviceToken(input: {
    name: string;
    scope: DeviceScope;
    tokenHash: string;
  }): Promise<DeviceTokenInfo> {
    const record: TokenRecord = {
      id: randomUUID(),
      name: input.name,
      scope: input.scope,
      tokenHash: input.tokenHash,
      createdAt: this.now().toISOString(),
      lastUsedAt: null,
      revokedAt: null,
    };
    this.tokens.push(record);
    return toInfo(record);
  }

  async findActiveDeviceToken(tokenHash: string): Promise<DeviceTokenInfo | null> {
    const found = this.tokens.find((t) => t.tokenHash === tokenHash && t.revokedAt === null);
    if (!found) return null;
    found.lastUsedAt = this.now().toISOString();
    return toInfo(found);
  }

  async listDeviceTokens(): Promise<DeviceTokenInfo[]> {
    return this.tokens.map(toInfo);
  }

  async revokeDeviceToken(id: string): Promise<boolean> {
    const found = this.tokens.find((t) => t.id === id && t.revokedAt === null);
    if (!found) return false;
    found.revokedAt = this.now().toISOString();
    return true;
  }
}

function toInfo(record: TokenRecord): DeviceTokenInfo {
  const { tokenHash: _tokenHash, ...info } = record;
  return info;
}
