import { createHash, randomBytes } from "node:crypto";
import type { Row, SqlClient } from "../sql.js";

export type Scope = "read" | "write";

export interface ApiToken {
  id: string;
  name: string;
  scope: Scope;
  createdAt: string;
  lastUsedAt: string | null;
}

export const TOKEN_PREFIX = "asa_";
const TOUCH_EVERY_MS = 60_000;

export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

const iso = (v: unknown) => new Date(v as string | Date).toISOString();

function toToken(row: Row): ApiToken {
  return {
    id: row.id as string,
    name: row.name as string,
    scope: row.scope as Scope,
    createdAt: iso(row.created_at),
    lastUsedAt: row.last_used_at == null ? null : iso(row.last_used_at),
  };
}

export class PgTokenStore {
  constructor(
    private readonly sql: SqlClient,
    private readonly clock: () => number = Date.now,
  ) {}

  async list(): Promise<ApiToken[]> {
    const rows = await this.sql.query(`select id, name, scope, created_at, last_used_at from api_tokens where revoked_at is null order by created_at desc, id`);
    return rows.map(toToken);
  }

  /** Cria e devolve o token em texto puro. Ele não pode ser lido de novo depois disso. */
  async create(name: string, scope: Scope): Promise<{ token: ApiToken; secret: string }> {
    const secret = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
    const rows = await this.sql.query(
      `insert into api_tokens (name, scope, token_hash, created_at) values ($1, $2, $3, $4) returning id, name, scope, created_at, last_used_at`,
      [name, scope, hashToken(secret), new Date(this.clock()).toISOString()],
    );
    return { token: toToken(rows[0]!), secret };
  }

  async revoke(id: string): Promise<boolean> {
    const rows = await this.sql.query(`update api_tokens set revoked_at = $2 where id = $1 and revoked_at is null returning id`, [id, new Date(this.clock()).toISOString()]);
    return rows.length > 0;
  }

  /** Confere um token e anota o uso (no máximo uma vez por minuto). */
  async verify(secret: string): Promise<{ id: string; scope: Scope } | null> {
    if (!secret.startsWith(TOKEN_PREFIX)) return null;
    const rows = await this.sql.query(`select id, scope, last_used_at from api_tokens where token_hash = $1 and revoked_at is null`, [hashToken(secret)]);
    const row = rows[0];
    if (!row) return null;
    const now = this.clock();
    if (row.last_used_at == null || now - Date.parse(iso(row.last_used_at)) > TOUCH_EVERY_MS) {
      await this.sql.query(`update api_tokens set last_used_at = $2 where id = $1`, [row.id, new Date(now).toISOString()]);
    }
    return { id: row.id as string, scope: row.scope as Scope };
  }
}
