import type { Row, SqlClient } from "../sql.js";
import type {
  AuthStore,
  DeviceScope,
  DeviceTokenInfo,
  NewPasskey,
  PasswordState,
  StoredPasskey,
} from "./store.js";

const PASSKEY_COLUMNS =
  "id, credential_id, encode(public_key, 'base64') as public_key, counter, array_to_string(transports, ',') as transports, name, created_at";
const TOKEN_COLUMNS = "id, name, scope, created_at, last_used_at, revoked_at";
const TOUCH_INTERVAL = "1 hour";

function iso(value: unknown): string {
  return new Date(value as string | Date).toISOString();
}

function toPasskey(row: Row): StoredPasskey {
  const transports = (row.transports as string | null) ?? "";
  return {
    id: row.id as string,
    credentialId: row.credential_id as string,
    publicKey: new Uint8Array(Buffer.from(row.public_key as string, "base64")),
    counter: Number(row.counter),
    transports: transports === "" ? [] : transports.split(","),
    name: row.name as string,
    createdAt: iso(row.created_at),
  };
}

function toToken(row: Row): DeviceTokenInfo {
  return {
    id: row.id as string,
    name: row.name as string,
    scope: row.scope as DeviceScope,
    createdAt: iso(row.created_at),
    lastUsedAt: row.last_used_at == null ? null : iso(row.last_used_at),
    revokedAt: row.revoked_at == null ? null : iso(row.revoked_at),
  };
}

export class PgAuthStore implements AuthStore {
  constructor(private readonly sql: SqlClient) {}

  async listPasskeys(): Promise<StoredPasskey[]> {
    const rows = await this.sql.query(`select ${PASSKEY_COLUMNS} from passkeys order by created_at asc`);
    return rows.map(toPasskey);
  }

  async addPasskey(passkey: NewPasskey): Promise<StoredPasskey> {
    const rows = await this.sql.query(
      `insert into passkeys (credential_id, public_key, counter, transports, name)
       values ($1, decode($2, 'base64'), $3, coalesce(string_to_array(nullif($4, ''), ','), '{}'), $5)
       returning ${PASSKEY_COLUMNS}`,
      [
        passkey.credentialId,
        Buffer.from(passkey.publicKey).toString("base64"),
        passkey.counter,
        passkey.transports.join(","),
        passkey.name,
      ],
    );
    return toPasskey(rows[0]!);
  }

  async updatePasskeyCounter(credentialId: string, counter: number): Promise<void> {
    await this.sql.query("update passkeys set counter = $2 where credential_id = $1", [credentialId, counter]);
  }

  async createDeviceToken(input: {
    name: string;
    scope: DeviceScope;
    tokenHash: string;
  }): Promise<DeviceTokenInfo> {
    const rows = await this.sql.query(
      `insert into device_tokens (name, scope, token_hash) values ($1, $2, $3) returning ${TOKEN_COLUMNS}`,
      [input.name, input.scope, input.tokenHash],
    );
    return toToken(rows[0]!);
  }

  async findActiveDeviceToken(tokenHash: string): Promise<DeviceTokenInfo | null> {
    const rows = await this.sql.query(
      `select ${TOKEN_COLUMNS} from device_tokens where token_hash = $1 and revoked_at is null`,
      [tokenHash],
    );
    const row = rows[0];
    if (!row) return null;
    await this.sql.query(
      `update device_tokens set last_used_at = now()
       where id = $1 and (last_used_at is null or last_used_at < now() - interval '${TOUCH_INTERVAL}')`,
      [row.id],
    );
    return toToken(row);
  }

  async listDeviceTokens(): Promise<DeviceTokenInfo[]> {
    const rows = await this.sql.query(`select ${TOKEN_COLUMNS} from device_tokens order by created_at asc`);
    return rows.map(toToken);
  }

  async revokeDeviceToken(id: string): Promise<boolean> {
    const rows = await this.sql.query(
      "update device_tokens set revoked_at = now() where id = $1 and revoked_at is null returning id",
      [id],
    );
    return rows.length > 0;
  }

  async getPassword(): Promise<PasswordState | null> {
    const rows = await this.sql.query("select hash, failed_count, locked_until from owner_password where id = 1");
    const row = rows[0];
    if (!row) return null;
    return {
      hash: row.hash as string,
      failedCount: Number(row.failed_count),
      lockedUntil: row.locked_until == null ? null : iso(row.locked_until),
    };
  }

  async setPassword(hash: string): Promise<void> {
    await this.sql.query(
      `insert into owner_password (id, hash) values (1, $1)
       on conflict (id) do update set hash = excluded.hash, failed_count = 0, locked_until = null, updated_at = now()`,
      [hash],
    );
  }

  async recordPasswordFailure(): Promise<number> {
    const rows = await this.sql.query(
      "update owner_password set failed_count = failed_count + 1 where id = 1 returning failed_count",
    );
    return Number(rows[0]?.failed_count ?? 0);
  }

  async lockPassword(until: string): Promise<void> {
    await this.sql.query("update owner_password set locked_until = $1 where id = 1", [until]);
  }

  async resetPasswordFailures(): Promise<void> {
    await this.sql.query("update owner_password set failed_count = 0, locked_until = null where id = 1");
  }
}
