import type { Row, SqlClient } from "../sql.js";
import type { Goal, GoalPatch, NewGoal } from "./model.js";

const SELECT = `g.id, g.title, g.description, g.due_date::text as d, g.done_at is not null as done, g.created_at,
  count(t.id)::int as total, (count(t.id) filter (where t.done_at is not null))::int as finished`;

// Só tarefas principais e simples entram na conta.
const JOIN = `left join tasks t on t.goal_id = g.id and t.deleted_at is null and t.parent_id is null and t.recurrence is null`;

function toGoal(row: Row): Goal {
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string,
    dueDate: (row.d as string | null) ?? null,
    done: row.done as boolean,
    createdAt: new Date(row.created_at as string | Date).toISOString(),
    tasksTotal: Number(row.total),
    tasksDone: Number(row.finished),
  };
}

export class PgGoalStore {
  constructor(
    private readonly sql: SqlClient,
    private readonly clock: () => number = Date.now,
  ) {}

  private nowIso(): string {
    return new Date(this.clock()).toISOString();
  }

  async list(): Promise<Goal[]> {
    const rows = await this.sql.query(
      `select ${SELECT} from goals g ${JOIN} where g.deleted_at is null
        group by g.id order by g.due_date nulls last, g.created_at, g.id`,
    );
    return rows.map(toGoal);
  }

  async get(id: string): Promise<Goal | null> {
    const rows = await this.sql.query(
      `select ${SELECT} from goals g ${JOIN} where g.id = $1 and g.deleted_at is null group by g.id`,
      [id],
    );
    return rows[0] ? toGoal(rows[0]) : null;
  }

  async create(input: NewGoal): Promise<Goal> {
    const now = this.nowIso();
    const rows = await this.sql.query(
      `insert into goals (title, description, due_date, created_at, updated_at) values ($1, $2, $3, $4, $4) returning id`,
      [input.title, input.description, input.dueDate, now],
    );
    return (await this.get(rows[0]!.id as string))!;
  }

  async update(id: string, patch: GoalPatch): Promise<Goal | null> {
    const cur = await this.get(id);
    if (!cur) return null;
    const now = this.nowIso();
    const done = patch.done ?? cur.done;
    await this.sql.query(
      // Reabrir mantém a data de conclusão antiga só enquanto estiver concluída.
      `update goals set title = $2, description = $3, due_date = $4, updated_at = $5,
              done_at = case when $6::boolean then coalesce(done_at, $5::timestamptz) else null end
        where id = $1`,
      [id, patch.title ?? cur.title, patch.description ?? cur.description, patch.dueDate !== undefined ? patch.dueDate : cur.dueDate, now, done],
    );
    return this.get(id);
  }

  async softDelete(id: string): Promise<boolean> {
    const rows = await this.sql.query(
      `update goals set deleted_at = $2, updated_at = $2 where id = $1 and deleted_at is null returning id`,
      [id, this.nowIso()],
    );
    return rows.length > 0;
  }

  async restore(id: string): Promise<Goal | null> {
    const rows = await this.sql.query(
      `update goals set deleted_at = null, updated_at = $2 where id = $1 and deleted_at is not null returning id`,
      [id, this.nowIso()],
    );
    return rows.length > 0 ? this.get(id) : null;
  }
}
