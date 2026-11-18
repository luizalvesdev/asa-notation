import type { SqlClient } from "../sql.js";

export interface DayActivity {
  /** Tarefas concluídas no dia (simples e ocorrências de recorrentes). */
  tasks: number;
  /** Cards revisados. */
  reviews: number;
  /** Segundos de estudo. */
  seconds: number;
}

/** Limites do intervalo [from, to] (datas locais) como instantes no fuso `tz` ($3). */
const FROM_TS = "($1::date)::timestamp at time zone $3";
const TO_TS = "(($2::date) + 1)::timestamp at time zone $3";

/** O que foi feito em cada dia local entre `from` e `to` (inclusive). Dias sem nada não aparecem. */
export async function dailyActivity(sql: SqlClient, from: string, to: string, tz: string): Promise<Map<string, DayActivity>> {
  const [simple, recurring, reviews] = await Promise.all([
    sql.query(
      `select to_char((done_at at time zone $3)::date, 'YYYY-MM-DD') as day, count(*)::int as n
         from tasks where deleted_at is null and recurrence is null and done_at >= ${FROM_TS} and done_at < ${TO_TS} group by 1`,
      [from, to, tz],
    ),
    sql.query(
      `select to_char(c.day, 'YYYY-MM-DD') as day, count(*)::int as n
         from task_completions c join tasks t on t.id = c.task_id
        where t.deleted_at is null and c.day between $1::date and $2::date group by 1`,
      [from, to],
    ),
    sql.query(
      `select to_char((reviewed_at at time zone $3)::date, 'YYYY-MM-DD') as day, count(*)::int as n, coalesce(sum(duration_ms), 0)::bigint as ms
         from review_logs where reviewed_at >= ${FROM_TS} and reviewed_at < ${TO_TS} group by 1`,
      [from, to, tz],
    ),
  ]);

  const out = new Map<string, DayActivity>();
  const at = (day: string) => {
    let entry = out.get(day);
    if (!entry) out.set(day, (entry = { tasks: 0, reviews: 0, seconds: 0 }));
    return entry;
  };
  for (const r of simple) at(r.day as string).tasks += Number(r.n);
  for (const r of recurring) at(r.day as string).tasks += Number(r.n);
  for (const r of reviews) {
    const e = at(r.day as string);
    e.reviews += Number(r.n);
    e.seconds += Math.round(Number(r.ms) / 1000);
  }
  return out;
}
