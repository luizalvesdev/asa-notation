import type { SqlClient } from "../sql.js";
import { DEFAULT_SETTINGS, type Settings } from "./model.js";

export class PgSettingsStore {
  constructor(
    private readonly sql: SqlClient,
    private readonly clock: () => number = Date.now,
  ) {}

  /** O que foi salvo por cima dos padrões (campos que faltam voltam ao padrão). */
  async get(): Promise<Settings> {
    const rows = await this.sql.query(`select data from settings where id`);
    const saved = (rows[0]?.data ?? {}) as Partial<Settings>;
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      checkins: { ...DEFAULT_SETTINGS.checkins, ...(saved.checkins ?? {}) },
      quiet: { ...DEFAULT_SETTINGS.quiet, ...(saved.quiet ?? {}) },
    };
  }

  async put(settings: Settings): Promise<Settings> {
    await this.sql.query(`update settings set data = $1::jsonb, updated_at = $2 where id`, [JSON.stringify(settings), new Date(this.clock()).toISOString()]);
    return this.get();
  }
}
