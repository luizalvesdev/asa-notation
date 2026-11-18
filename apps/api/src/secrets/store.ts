import type { SqlClient } from "../sql.js";
import { decryptSecret, encryptSecret } from "./crypto.js";

export class PgSecretStore {
  constructor(
    private readonly sql: SqlClient,
    private readonly key: Buffer,
    private readonly clock: () => number = Date.now,
  ) {}

  async set(name: string, value: string): Promise<void> {
    await this.sql.query(
      `insert into secrets (name, ciphertext, last4, updated_at) values ($1, $2, $3, $4)
       on conflict (name) do update set ciphertext = $2, last4 = $3, updated_at = $4`,
      [name, encryptSecret(value, this.key), value.slice(-4), new Date(this.clock()).toISOString()],
    );
  }

  async get(name: string): Promise<string | null> {
    const rows = await this.sql.query(`select ciphertext from secrets where name = $1`, [name]);
    return rows[0] ? decryptSecret(rows[0].ciphertext as string, this.key) : null;
  }

  /** Só o final: é o que a tela pode mostrar. */
  async last4(name: string): Promise<string | null> {
    const rows = await this.sql.query(`select last4 from secrets where name = $1`, [name]);
    return rows[0] ? (rows[0].last4 as string) : null;
  }

  async remove(name: string): Promise<boolean> {
    return (await this.sql.query(`delete from secrets where name = $1 returning name`, [name])).length > 0;
  }
}
