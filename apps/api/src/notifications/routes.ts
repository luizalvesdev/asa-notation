import { UUID_SOURCE, badRequest, isRecord, json, notFound, type Route } from "../routing.js";
import type { PgSettingsStore } from "../settings/store.js";
import type { PgTaskStore } from "../tasks/store.js";
import type { SqlClient } from "../sql.js";
import { dueCheckins, type DueCheckin } from "./checkins.js";
import type { PgNotificationStore } from "./store.js";

const ID = `(${UUID_SOURCE})`;

interface Deps {
  store: PgNotificationStore;
  settings: PgSettingsStore;
  tasks: PgTaskStore;
  sql: SqlClient;
  now: () => number;
}

/** O horário em que o check-in aconteceu, como instante: usado só para ordenar a lista. */
function content(kind: DueCheckin["kind"], todayCount: number, lateCount: number, cards: number) {
  if (kind === "plan") {
    const parts = [`${todayCount} ${todayCount === 1 ? "tarefa" : "tarefas"} hoje`, `${lateCount} ${lateCount === 1 ? "atrasada" : "atrasadas"}`];
    if (cards > 0) parts.push(`${cards} ${cards === 1 ? "card" : "cards"} para revisar`);
    return { title: "Plano do dia", body: parts.join(" · "), link: "#/hoje" };
  }
  if (kind === "thursday") return { title: "Métricas da quinta", body: "Veja os números da semana até agora.", link: "#/rotina/quinta" };
  return { title: "Revisão do sábado", body: "Cinco perguntas rápidas para fechar a semana.", link: "#/rotina/sabado" };
}

/** Cria os check-ins que já deveriam ter acontecido e ainda não estão na caixa. */
async function generate({ store, settings, tasks, sql, now }: Deps): Promise<void> {
  const config = await settings.get();
  const due = dueCheckins(now(), config);
  const existing = await store.existingKeys(due.map((d) => d.dedupeKey));
  for (const item of due.filter((d) => !existing.has(d.dedupeKey))) {
    let todayCount = 0;
    let lateCount = 0;
    let cards = 0;
    if (item.kind === "plan") {
      const list = await tasks.list(item.date, item.date, item.date);
      todayCount = list.days.filter((t) => !t.done).length;
      lateCount = list.late.length;
      const rows = await sql.query(`select count(*)::int as n from cards where deleted_at is null and state <> 0 and due_at <= $1`, [new Date(now()).toISOString()]);
      cards = Number(rows[0]?.n ?? 0);
    }
    await store.create({ kind: item.kind, ...content(item.kind, todayCount, lateCount, cards), dedupeKey: item.dedupeKey, createdAt: new Date(now() - item.daysAgo * 24 * 3_600_000).toISOString() });
  }
}

export function notificationRoutes(deps: Deps): Route[] {
  const { store } = deps;
  return [
    {
      method: "GET",
      pattern: /^\/notifications$/,
      access: "session",
      handle: async ({ req }) => {
        const filter = req.query.filter ?? "all";
        if (filter !== "all" && filter !== "unread") return badRequest("invalid_filter");
        await generate(deps);
        const [items, unread] = await Promise.all([store.list(filter === "unread"), store.unread()]);
        return json(200, { items, unread });
      },
    },
    {
      method: "GET",
      pattern: /^\/notifications\/count$/,
      access: "session",
      handle: async () => {
        await generate(deps);
        return json(200, { unread: await store.unread() });
      },
    },
    {
      method: "POST",
      pattern: /^\/notifications\/read-all$/,
      access: "session",
      handle: async () => json(200, { updated: await store.readAll() }),
    },
    {
      method: "PATCH",
      pattern: new RegExp(`^/notifications/${ID}$`),
      access: "session",
      handle: async ({ req, match }) => {
        const body = isRecord(req.body) ? req.body : {};
        if (typeof body.read !== "boolean") return badRequest("invalid_read");
        return (await store.setRead(match[1]!, body.read)) ? json(200, { read: body.read }) : notFound();
      },
    },
  ];
}
