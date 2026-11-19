import type { SqlClient } from "../sql.js";
import type { PgSecretStore } from "../secrets/store.js";
import { generateVapidKeys, type PushSubscriptionKeys, type VapidKeys } from "./webpush.js";

const VAPID_SECRET = "push_vapid";

export interface PushSubscriptionRow extends PushSubscriptionKeys {
  id: string;
  label: string;
  createdAt: string;
  lastOkAt: string | null;
}

export interface PendingPush {
  id: string;
  title: string;
  body: string;
  link: string | null;
}

export class PgPushStore {
  constructor(
    private readonly sql: SqlClient,
    private readonly secrets: PgSecretStore,
    private readonly clock: () => number = Date.now,
  ) {}

  /** Chaves VAPID do servidor: criadas no primeiro uso e guardadas cifradas. */
  async vapid(): Promise<VapidKeys> {
    const saved = await this.secrets.get(VAPID_SECRET);
    if (saved) return JSON.parse(saved) as VapidKeys;
    const keys = generateVapidKeys();
    await this.secrets.set(VAPID_SECRET, JSON.stringify(keys));
    // Outra requisição pode ter criado ao mesmo tempo: vale a que ficou gravada.
    return JSON.parse((await this.secrets.get(VAPID_SECRET))!) as VapidKeys;
  }

  async subscribe(sub: PushSubscriptionKeys, label: string): Promise<void> {
    await this.sql.query(
      `insert into push_subscriptions (endpoint, p256dh, auth, label, created_at) values ($1, $2, $3, $4, $5)
       on conflict (endpoint) do update set p256dh = $2, auth = $3, label = $4`,
      [sub.endpoint, sub.p256dh, sub.auth, label, new Date(this.clock()).toISOString()],
    );
  }

  async unsubscribe(endpoint: string): Promise<boolean> {
    return (await this.sql.query(`delete from push_subscriptions where endpoint = $1 returning id`, [endpoint])).length > 0;
  }

  async removeById(id: string): Promise<boolean> {
    return (await this.sql.query(`delete from push_subscriptions where id = $1 returning id`, [id])).length > 0;
  }

  async list(): Promise<PushSubscriptionRow[]> {
    const rows = await this.sql.query(`select id, endpoint, p256dh, auth, label, created_at, last_ok_at from push_subscriptions order by created_at`);
    return rows.map((r) => ({
      id: r.id as string,
      endpoint: r.endpoint as string,
      p256dh: r.p256dh as string,
      auth: r.auth as string,
      label: r.label as string,
      createdAt: new Date(r.created_at as string | Date).toISOString(),
      lastOkAt: r.last_ok_at ? new Date(r.last_ok_at as string | Date).toISOString() : null,
    }));
  }

  async markOk(id: string): Promise<void> {
    await this.sql.query(`update push_subscriptions set last_ok_at = $2 where id = $1`, [id, new Date(this.clock()).toISOString()]);
  }

  /** Avisos ainda não lidos nem enviados, das últimas `windowHours` horas. */
  async pending(windowHours: number): Promise<PendingPush[]> {
    const since = new Date(this.clock() - windowHours * 3_600_000).toISOString();
    const rows = await this.sql.query(
      `select id, title, body, link from notifications where pushed_at is null and read_at is null and created_at >= $1 order by created_at limit 10`,
      [since],
    );
    return rows.map((r) => ({ id: r.id as string, title: r.title as string, body: r.body as string, link: (r.link as string | null) ?? null }));
  }

  /** Marca como enviados também os que ficaram fora da janela, para não acumular. */
  async markPushed(ids: string[]): Promise<void> {
    await this.sql.query(`update notifications set pushed_at = $2 where pushed_at is null and (id = any($1::uuid[]) or read_at is not null)`, [ids, new Date(this.clock()).toISOString()]);
  }
}
