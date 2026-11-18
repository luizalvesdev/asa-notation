import type { SqlClient } from "../sql.js";

export interface PasswordState {
  hash: string;
  failedCount: number;
  lockedUntil: string | null;
}

export interface FailureResult {
  failedCount: number;
  lockedUntil: string | null;
}

export class PgAuthStore {
  constructor(private readonly sql: SqlClient) {}

  async getPassword(): Promise<PasswordState | null> {
    const rows = await this.sql.query("select hash, failed_count, locked_until from owner_password where id = 1");
    const row = rows[0];
    if (!row) return null;
    return {
      hash: row.hash as string,
      failedCount: Number(row.failed_count),
      lockedUntil: row.locked_until == null ? null : new Date(row.locked_until as string | Date).toISOString(),
    };
  }

  /** Grava o hash e zera o controle de falhas. */
  async setPassword(hash: string, nowIso: string): Promise<void> {
    await this.sql.query(
      `insert into owner_password (id, hash, failed_count, locked_until, updated_at)
       values (1, $1, 0, null, $2)
       on conflict (id) do update
         set hash = excluded.hash, failed_count = 0, locked_until = null, updated_at = excluded.updated_at`,
      [hash, nowIso],
    );
  }

  /**
   * Conta uma falha de forma atômica. A cada `maxFailures` falhas seguidas, bloqueia até `lockUntilIso`.
   */
  async recordFailure(maxFailures: number, lockUntilIso: string): Promise<FailureResult | null> {
    const rows = await this.sql.query(
      `update owner_password
          set failed_count = failed_count + 1,
              locked_until = case when (failed_count + 1) % $1 = 0 then $2::timestamptz else locked_until end
        where id = 1
        returning failed_count, locked_until`,
      [maxFailures, lockUntilIso],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      failedCount: Number(row.failed_count),
      lockedUntil: row.locked_until == null ? null : new Date(row.locked_until as string | Date).toISOString(),
    };
  }

  async resetFailures(): Promise<void> {
    await this.sql.query("update owner_password set failed_count = 0, locked_until = null where id = 1");
  }
}
