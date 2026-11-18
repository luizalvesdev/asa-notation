import type { Row, SqlClient } from "../sql.js";
import type { NewTask, Subtask, TaskItem, TaskList, TaskPatch } from "./model.js";
import { occurrences, type Recurrence } from "./recurrence.js";

const SELECT = `id, title, due_date::text as d, to_char(due_time, 'HH24:MI') as t, recurrence, done_at is not null as done, parent_id`;

export type CreateResult = { kind: "ok"; task: TaskItem } | { kind: "parent_not_found" } | { kind: "invalid" };
export type UpdateResult = { kind: "ok"; task: TaskItem } | { kind: "not_found" } | { kind: "invalid" };
export type DoneResult = "ok" | "not_found" | "invalid";

function toItem(row: Row, date: string | null, done: boolean, subtasks: Subtask[]): TaskItem {
  return {
    id: row.id as string,
    title: row.title as string,
    date,
    time: (row.t as string | null) ?? null,
    recurrence: (row.recurrence as Recurrence | null) ?? null,
    done,
    subtasks,
  };
}

function byWhen(a: TaskItem, b: TaskItem): number {
  return (
    (a.date ?? "").localeCompare(b.date ?? "") ||
    (a.time ?? "99:99").localeCompare(b.time ?? "99:99") ||
    a.title.localeCompare(b.title)
  );
}

export class PgTaskStore {
  constructor(
    private readonly sql: SqlClient,
    private readonly clock: () => number = Date.now,
  ) {}

  private nowIso(): string {
    return new Date(this.clock()).toISOString();
  }

  private async subtasksOf(ids: string[]): Promise<Map<string, Subtask[]>> {
    const map = new Map<string, Subtask[]>();
    if (ids.length === 0) return map;
    const rows = await this.sql.query(
      `select id, parent_id, title, done_at is not null as done from tasks
        where parent_id = any($1::uuid[]) and deleted_at is null order by created_at asc, id asc`,
      [ids],
    );
    for (const row of rows) {
      const list = map.get(row.parent_id as string) ?? [];
      list.push({ id: row.id as string, title: row.title as string, done: row.done as boolean });
      map.set(row.parent_id as string, list);
    }
    return map;
  }

  async list(from: string, to: string, today: string): Promise<TaskList> {
    const [plain, recurring, late, undated] = await Promise.all([
      this.sql.query(
        `select ${SELECT} from tasks
          where deleted_at is null and parent_id is null and recurrence is null and due_date between $1 and $2`,
        [from, to],
      ),
      this.sql.query(
        `select ${SELECT} from tasks
          where deleted_at is null and parent_id is null and recurrence is not null and due_date <= $1`,
        [to],
      ),
      this.sql.query(
        `select ${SELECT} from tasks
          where deleted_at is null and parent_id is null and recurrence is null and done_at is null and due_date < $1`,
        [today],
      ),
      this.sql.query(
        `select ${SELECT} from tasks
          where deleted_at is null and parent_id is null and due_date is null and done_at is null`,
      ),
    ]);

    const completed = new Set<string>();
    if (recurring.length > 0) {
      const rows = await this.sql.query(
        `select task_id, day::text as day from task_completions
          where task_id = any($1::uuid[]) and day between $2 and $3`,
        [recurring.map((r) => r.id as string), from, to],
      );
      for (const row of rows) completed.add(`${row.task_id as string}|${row.day as string}`);
    }

    const ids = [...new Set([...plain, ...recurring, ...late, ...undated].map((r) => r.id as string))];
    const subs = await this.subtasksOf(ids);
    const subsOf = (row: Row) => subs.get(row.id as string) ?? [];

    const days: TaskItem[] = plain.map((row) => toItem(row, row.d as string, row.done as boolean, subsOf(row)));
    for (const row of recurring) {
      for (const day of occurrences(row.recurrence as Recurrence, row.d as string, from, to)) {
        days.push(toItem(row, day, completed.has(`${row.id as string}|${day}`), subsOf(row)));
      }
    }
    return {
      days: days.sort(byWhen),
      late: late.map((row) => toItem(row, row.d as string, false, subsOf(row))).sort(byWhen),
      undated: undated
        .map((row) => toItem(row, null, false, subsOf(row)))
        .sort((a, b) => a.title.localeCompare(b.title)),
    };
  }

  async get(id: string): Promise<TaskItem | null> {
    const rows = await this.sql.query(`select ${SELECT} from tasks where id = $1 and deleted_at is null`, [id]);
    const row = rows[0];
    if (!row) return null;
    const subs = await this.subtasksOf([id]);
    return toItem(row, (row.d as string | null) ?? null, row.recurrence ? false : (row.done as boolean), subs.get(id) ?? []);
  }

  async create(input: NewTask): Promise<CreateResult> {
    if (input.parentId) {
      const parent = await this.sql.query(
        `select 1 from tasks where id = $1 and deleted_at is null and parent_id is null`,
        [input.parentId],
      );
      if (parent.length === 0) return { kind: "parent_not_found" };
      if (input.date || input.time || input.recurrence) return { kind: "invalid" };
    }
    if ((input.time || input.recurrence) && !input.date) return { kind: "invalid" };
    const now = this.nowIso();
    const rows = await this.sql.query(
      `insert into tasks (parent_id, title, due_date, due_time, recurrence, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $6) returning id`,
      [input.parentId, input.title, input.date, input.time, input.recurrence, now],
    );
    return { kind: "ok", task: (await this.get(rows[0]!.id as string))! };
  }

  async update(id: string, patch: TaskPatch): Promise<UpdateResult> {
    const rows = await this.sql.query(`select ${SELECT} from tasks where id = $1 and deleted_at is null`, [id]);
    const cur = rows[0];
    if (!cur) return { kind: "not_found" };

    const date = patch.date !== undefined ? patch.date : ((cur.d as string | null) ?? null);
    // Sem data, não sobra hora nem recorrência.
    const time = date === null ? null : patch.time !== undefined ? patch.time : ((cur.t as string | null) ?? null);
    const recurrence =
      date === null ? null : patch.recurrence !== undefined ? patch.recurrence : ((cur.recurrence as Recurrence | null) ?? null);
    const title = patch.title ?? (cur.title as string);
    if (cur.parent_id && (date !== null || recurrence !== null)) return { kind: "invalid" };

    await this.sql.query(
      `update tasks set title = $2, due_date = $3, due_time = $4, recurrence = $5, updated_at = $6,
              done_at = case when $5::text is not null then null else done_at end
        where id = $1`,
      [id, title, date, time, recurrence, this.nowIso()],
    );
    return { kind: "ok", task: (await this.get(id))! };
  }

  /** Conclui ou reabre. Em recorrentes, vale para o dia `date`. */
  async setDone(id: string, done: boolean, date: string | null): Promise<DoneResult> {
    const rows = await this.sql.query(`select ${SELECT} from tasks where id = $1 and deleted_at is null`, [id]);
    const cur = rows[0];
    if (!cur) return "not_found";

    if (cur.recurrence) {
      if (!date || occurrences(cur.recurrence as Recurrence, cur.d as string, date, date).length !== 1) return "invalid";
      if (done) {
        await this.sql.query(`insert into task_completions (task_id, day) values ($1, $2) on conflict do nothing`, [id, date]);
      } else {
        await this.sql.query(`delete from task_completions where task_id = $1 and day = $2`, [id, date]);
      }
      return "ok";
    }
    await this.sql.query(`update tasks set done_at = $2, updated_at = $3 where id = $1`, [
      id,
      done ? this.nowIso() : null,
      this.nowIso(),
    ]);
    return "ok";
  }

  /** Muda a data de várias tarefas simples (não recorrentes, sem pai). Devolve quantas mudaram. */
  async reschedule(ids: string[], date: string): Promise<number> {
    if (ids.length === 0) return 0;
    const rows = await this.sql.query(
      `update tasks set due_date = $2, updated_at = $3
        where id = any($1::uuid[]) and deleted_at is null and parent_id is null and recurrence is null
        returning id`,
      [ids, date, this.nowIso()],
    );
    return rows.length;
  }

  async softDelete(id: string): Promise<boolean> {
    const rows = await this.sql.query(
      `update tasks set deleted_at = $2, updated_at = $2
        where (id = $1 or parent_id = $1) and deleted_at is null returning id`,
      [id, this.nowIso()],
    );
    return rows.some((r) => r.id === id);
  }

  async restore(id: string): Promise<TaskItem | null> {
    const rows = await this.sql.query(
      `with t as (select id, deleted_at from tasks where id = $1 and deleted_at is not null)
       update tasks set deleted_at = null, updated_at = $2
        where id in (select id from t) or (parent_id in (select id from t) and deleted_at = (select deleted_at from t))
        returning id`,
      [id, this.nowIso()],
    );
    return rows.some((r) => r.id === id) ? this.get(id) : null;
  }
}
