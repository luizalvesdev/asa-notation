import type { Row, SqlClient } from "../sql.js";
import { countChecks } from "./checks.js";
import type { Goal, GoalPatch, NewGoal } from "./model.js";

const SELECT = `g.id, g.title, g.description, g.due_date::text as d, g.done_at is not null as done, g.created_at,
  g.target, p.id as page_id, p.title as page_title,
  count(t.id)::int as total, (count(t.id) filter (where t.done_at is not null))::int as finished`;

// Só tarefas principais e simples entram na conta.
const JOIN = `left join tasks t on t.goal_id = g.id and t.deleted_at is null and t.parent_id is null and t.recurrence is null`;

// A página só vale se ainda existe (fora da lixeira).
const PAGE_JOIN = `left join pages p on p.id = g.page_id and p.deleted_at is null`;
const GROUP = "group by g.id, p.id, p.title";

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
    page: row.page_id ? { id: row.page_id as string, title: row.page_title as string } : null,
    target: row.target == null ? null : Number(row.target),
    checked: 0,
    checkboxes: 0,
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

  /** Conta os checkboxes da página ligada a cada meta. */
  private async withChecks(goals: Goal[]): Promise<Goal[]> {
    for (const goal of goals) {
      if (!goal.page) continue;
      const rows = await this.sql.query(`select body from pages where id = $1`, [goal.page.id]);
      const { total, done } = countChecks(rows[0]?.body ?? null);
      goal.checked = done;
      goal.checkboxes = total;
    }
    return goals;
  }

  async list(): Promise<Goal[]> {
    const rows = await this.sql.query(
      `select ${SELECT} from goals g ${JOIN} ${PAGE_JOIN} where g.deleted_at is null
        ${GROUP} order by g.due_date nulls last, g.created_at, g.id`,
    );
    return this.withChecks(rows.map(toGoal));
  }

  async get(id: string): Promise<Goal | null> {
    const rows = await this.sql.query(
      `select ${SELECT} from goals g ${JOIN} ${PAGE_JOIN} where g.id = $1 and g.deleted_at is null ${GROUP}`,
      [id],
    );
    return rows[0] ? (await this.withChecks([toGoal(rows[0])]))[0]! : null;
  }

  /** Por que a página não pode ser ligada a esta meta: não existe, ou já pertence a outra meta ativa. */
  async pageProblem(pageId: string, exceptGoalId: string | null): Promise<"page_not_found" | "page_taken" | null> {
    const page = await this.sql.query(`select 1 from pages where id = $1 and deleted_at is null and kind = 'page'`, [pageId]);
    if (page.length === 0) return "page_not_found";
    const taken = await this.sql.query(
      `select 1 from goals where page_id = $1 and deleted_at is null and ($2::uuid is null or id <> $2::uuid)`,
      [pageId, exceptGoalId],
    );
    return taken.length > 0 ? "page_taken" : null;
  }

  async create(input: NewGoal): Promise<Goal> {
    const now = this.nowIso();
    const rows = await this.sql.query(
      `insert into goals (title, description, due_date, page_id, target, created_at, updated_at) values ($1, $2, $3, $4, $5, $6, $6) returning id`,
      [input.title, input.description, input.dueDate, input.pageId ?? null, input.target ?? null, now],
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
              done_at = case when $6::boolean then coalesce(done_at, $5::timestamptz) else null end,
              page_id = $7, target = $8
        where id = $1`,
      [id, patch.title ?? cur.title, patch.description ?? cur.description, patch.dueDate !== undefined ? patch.dueDate : cur.dueDate, now, done, patch.pageId !== undefined ? patch.pageId : (cur.page?.id ?? null), patch.target !== undefined ? patch.target : cur.target],
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
