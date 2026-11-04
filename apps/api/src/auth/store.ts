export type DeviceScope = "full" | "bot" | "sync";

export interface StoredPasskey {
  id: string;
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[];
  name: string;
  createdAt: string;
}

export interface NewPasskey {
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[];
  name: string;
}

export interface DeviceTokenInfo {
  id: string;
  name: string;
  scope: DeviceScope;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface AuthStore {
  listPasskeys(): Promise<StoredPasskey[]>;
  addPasskey(passkey: NewPasskey): Promise<StoredPasskey>;
  updatePasskeyCounter(credentialId: string, counter: number): Promise<void>;
  createDeviceToken(input: { name: string; scope: DeviceScope; tokenHash: string }): Promise<DeviceTokenInfo>;
  findActiveDeviceToken(tokenHash: string): Promise<DeviceTokenInfo | null>;
  listDeviceTokens(): Promise<DeviceTokenInfo[]>;
  revokeDeviceToken(id: string): Promise<boolean>;
}
