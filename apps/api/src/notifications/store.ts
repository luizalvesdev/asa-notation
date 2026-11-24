import type { Row, SqlClient } from "../sql.js";
import type { CheckinKind } from "./checkins.js";

export interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  read: boolean;
}

export interface NewNotification {
  kind: CheckinKind | "study" | "info" | "task";
  title: string;
  body: string;
  link: string | null;
  dedupeKey: string;
  /** Quando o check-in aconteceu (ou deveria). */
  createdAt: string;
}

const COLUMNS = "id, kind, title, body, link, created_at, read_at";

function toNotification(row: Row): Notification {
  return {
    id: row.id as string,
    kind: row.kind as string,
    title: row.title as string,
    body: row.body as string,
    link: (row.link as string | null) ?? null,
    createdAt: new Date(row.created_at as string | Date).toISOString(),
    read: row.read_at != null,
  };
}

export class PgNotificationStore {
  constructor(
    private readonly sql: SqlClient,
    private readonly clock: () => number = Date.now,
  ) {}

  /** Chaves de deduplicação que já existem entre as pedidas. */
  async existingKeys(keys: string[]): Promise<Set<string>> {
    if (keys.length === 0) return new Set();
    const rows = await this.sql.query(`select dedupe_key from notifications where dedupe_key = any($1::text[])`, [keys]);
    return new Set(rows.map((r) => r.dedupe_key as string));
  }

  /** Cria se ainda não existir. Devolve true se criou. */
  async create(n: NewNotification): Promise<boolean> {
    const rows = await this.sql.query(
      `insert into notifications (kind, title, body, link, dedupe_key, created_at) values ($1, $2, $3, $4, $5, $6)
       on conflict (dedupe_key) do nothing returning id`,
      [n.kind, n.title, n.body, n.link, n.dedupeKey, n.createdAt],
    );
    return rows.length > 0;
  }

  async list(unreadOnly: boolean): Promise<Notification[]> {
    const rows = await this.sql.query(
      `select ${COLUMNS} from notifications ${unreadOnly ? "where read_at is null" : ""} order by created_at desc, id desc limit 100`,
    );
    return rows.map(toNotification);
  }

  async unread(): Promise<number> {
    const rows = await this.sql.query(`select count(*)::int as n from notifications where read_at is null`);
    return Number(rows[0]?.n ?? 0);
  }

  async setRead(id: string, read: boolean): Promise<boolean> {
    const rows = await this.sql.query(`update notifications set read_at = $2 where id = $1 returning id`, [id, read ? new Date(this.clock()).toISOString() : null]);
    return rows.length > 0;
  }

  async readAll(): Promise<number> {
    const rows = await this.sql.query(`update notifications set read_at = $1 where read_at is null returning id`, [new Date(this.clock()).toISOString()]);
    return rows.length;
  }
}
