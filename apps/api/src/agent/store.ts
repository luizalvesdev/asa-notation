import type { Row, SqlClient } from "../sql.js";

export const JOB_STATUSES = ["queued", "running", "review", "changes", "approved", "done", "failed", "canceled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export type EventKind = "created" | "started" | "progress" | "review" | "feedback" | "reply" | "approved" | "done" | "failed" | "canceled";

/** Situações em que o job ainda pode mudar. */
export const ACTIVE: ReadonlySet<JobStatus> = new Set(["queued", "running", "review", "changes", "approved"]);

export interface AgentCard {
  ref: string;
  title: string;
  status: string;
  url: string | null;
}

/** Repositório que o agente sabe usar, com a branch de onde parte por padrão. */
export interface AgentRepo {
  name: string;
  base: string;
}

export interface AgentPr {
  repo: string;
  url: string;
}

export interface AgentJob {
  id: string;
  ref: string;
  title: string;
  url: string | null;
  instruction: string;
  /** Repos escolhidos no celular; vazio usa o primeiro repo do agente. */
  repos: string[];
  /** Branch de partida escolhida no celular; null usa a de cada repo. */
  base: string | null;
  prs: AgentPr[];
  status: JobStatus;
  cancelRequested: boolean;
  /** Você pediu para o agente parar (ou mandou mensagem com ele trabalhando). */
  interruptRequested: boolean;
  /** Mensagem sua que o agente ainda não leu. */
  pendingMessage: boolean;
  prUrl: string | null;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentEvent {
  id: number;
  kind: EventKind;
  text: string;
  createdAt: string;
}

/** O que o agente deve fazer agora com um job. */
export type RunnerAction =
  | { action: "start"; job: AgentJob }
  | { action: "feedback"; job: AgentJob; feedback: string }
  | { action: "approve"; job: AgentJob }
  | { action: "cancel"; job: AgentJob };

const iso = (v: unknown) => new Date(v as string | Date).toISOString();

function toJob(row: Row): AgentJob {
  return {
    id: row.id as string,
    ref: row.ref as string,
    title: row.title as string,
    url: (row.url as string | null) ?? null,
    instruction: row.instruction as string,
    repos: (row.repos as string[] | null) ?? [],
    base: (row.base as string | null) ?? null,
    prs: (row.prs as AgentPr[] | null) ?? [],
    status: row.status as JobStatus,
    cancelRequested: row.cancel_requested as boolean,
    interruptRequested: (row.interrupt_requested as boolean | undefined) ?? false,
    pendingMessage: row.feedback !== null && row.feedback !== undefined,
    prUrl: (row.pr_url as string | null) ?? null,
    summary: row.summary as string,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

const COLS = "id, ref, title, url, instruction, repos, base, prs, status, cancel_requested, interrupt_requested, feedback, pr_url, summary, created_at, updated_at";

export class PgAgentStore {
  constructor(
    private readonly sql: SqlClient,
    private readonly clock: () => number = Date.now,
  ) {}

  private nowIso(): string {
    return new Date(this.clock()).toISOString();
  }

  async seen(): Promise<void> {
    await this.sql.query("insert into agent_runner (id, seen_at) values (1, $1) on conflict (id) do update set seen_at = excluded.seen_at", [this.nowIso()]);
  }

  async setRepos(repos: AgentRepo[]): Promise<void> {
    await this.sql.query("insert into agent_runner (id, seen_at, repos) values (1, $1, $2::jsonb) on conflict (id) do update set seen_at = excluded.seen_at, repos = excluded.repos", [this.nowIso(), JSON.stringify(repos)]);
  }

  async repos(): Promise<AgentRepo[]> {
    const rows = await this.sql.query("select repos from agent_runner where id = 1");
    return (rows[0]?.repos as AgentRepo[] | undefined) ?? [];
  }

  async seenAt(): Promise<string | null> {
    const rows = await this.sql.query("select seen_at from agent_runner where id = 1");
    return rows[0] ? iso(rows[0].seen_at) : null;
  }

  async cards(): Promise<AgentCard[]> {
    const rows = await this.sql.query("select ref, title, status, url from agent_cards order by position, ref");
    return rows.map((r) => ({ ref: r.ref as string, title: r.title as string, status: r.status as string, url: (r.url as string | null) ?? null }));
  }

  async card(ref: string): Promise<AgentCard | null> {
    return (await this.cards()).find((c) => c.ref === ref) ?? null;
  }

  async replaceCards(cards: AgentCard[]): Promise<void> {
    await this.sql.query("delete from agent_cards");
    for (const [i, c] of cards.entries()) {
      await this.sql.query("insert into agent_cards (ref, title, status, url, position) values ($1, $2, $3, $4, $5) on conflict (ref) do nothing", [c.ref, c.title, c.status, c.url, i]);
    }
  }

  async jobs(limit = 50): Promise<AgentJob[]> {
    const rows = await this.sql.query(`select ${COLS} from agent_jobs order by created_at desc, id limit $1`, [limit]);
    return rows.map(toJob);
  }

  /** Jobs de um card, do mais antigo ao mais novo: o histórico da conversa no card. */
  async jobsFor(ref: string, limit = 20): Promise<AgentJob[]> {
    const rows = await this.sql.query(`select ${COLS} from (select ${COLS} from agent_jobs where ref = $1 order by created_at desc limit $2) t order by created_at, id`, [ref, limit]);
    return rows.map(toJob);
  }

  async get(id: string): Promise<AgentJob | null> {
    const rows = await this.sql.query(`select ${COLS} from agent_jobs where id = $1`, [id]);
    return rows[0] ? toJob(rows[0]) : null;
  }

  async events(jobId: string): Promise<AgentEvent[]> {
    const rows = await this.sql.query("select id, kind, text, created_at from agent_events where job_id = $1 order by id", [jobId]);
    return rows.map((r) => ({ id: Number(r.id), kind: r.kind as EventKind, text: r.text as string, createdAt: iso(r.created_at) }));
  }

  async addEvent(jobId: string, kind: EventKind, text = ""): Promise<void> {
    await this.sql.query("insert into agent_events (job_id, kind, text, created_at) values ($1, $2, $3, $4)", [jobId, kind, text, this.nowIso()]);
  }

  async create(input: { ref: string; title: string; url: string | null; instruction: string; repos?: string[]; base?: string | null }): Promise<AgentJob> {
    const now = this.nowIso();
    const rows = await this.sql.query(
      `insert into agent_jobs (ref, title, url, instruction, repos, base, created_at, updated_at) values ($1, $2, $3, $4, $5::text[], $6, $7, $7) returning ${COLS}`,
      [input.ref, input.title, input.url, input.instruction, input.repos ?? [], input.base ?? null, now],
    );
    const job = toJob(rows[0]!);
    await this.addEvent(job.id, "created", input.instruction);
    return job;
  }

  /** Muda o status só se o job ainda está num dos `from`. Devolve o job atualizado ou null. */
  async transition(id: string, from: JobStatus[], to: JobStatus, set: { feedback?: string | null; prUrl?: string | null; prs?: AgentPr[]; summary?: string; cancelRequested?: boolean; interruptRequested?: boolean } = {}): Promise<AgentJob | null> {
    const rows = await this.sql.query(
      `update agent_jobs set status = $3, updated_at = $4,
          feedback = case when $5::boolean then $6 else feedback end,
          pr_url = case when $7::boolean then $8 else pr_url end,
          summary = coalesce($9, summary),
          cancel_requested = coalesce($10, cancel_requested),
          prs = coalesce($11::jsonb, prs),
          interrupt_requested = coalesce($12, interrupt_requested)
        where id = $1 and status = any($2::text[]) returning ${COLS}`,
      [id, from, to, this.nowIso(), set.feedback !== undefined, set.feedback ?? null, set.prUrl !== undefined, set.prUrl ?? null, set.summary ?? null, set.cancelRequested ?? null, set.prs === undefined ? null : JSON.stringify(set.prs), set.interruptRequested ?? null],
    );
    return rows[0] ? toJob(rows[0]) : null;
  }

  /** Com o agente trabalhando: pede a parada e, se houver, guarda a mensagem (somando a outra ainda não lida). */
  async requestInterrupt(id: string, message?: string): Promise<AgentJob | null> {
    const rows = await this.sql.query(
      `update agent_jobs set interrupt_requested = true, updated_at = $2,
          feedback = case when $3::text is null then feedback when feedback is null then $3 else left(feedback || E'\n\n' || $3, 4000) end
        where id = $1 and status = 'running' returning ${COLS}`,
      [id, this.nowIso(), message ?? null],
    );
    return rows[0] ? toJob(rows[0]) : null;
  }

  async requestCancel(id: string): Promise<AgentJob | null> {
    const rows = await this.sql.query(`update agent_jobs set cancel_requested = true, updated_at = $2 where id = $1 and status = any($3::text[]) returning ${COLS}`, [id, this.nowIso(), [...ACTIVE]]);
    return rows[0] ? toJob(rows[0]) : null;
  }

  /**
   * Próxima tarefa do agente, já marcada como dele (o mesmo pedido não sai duas vezes).
   * Ordem: cancelamentos, aprovações, pedidos de mudança e, por último, jobs novos.
   */
  async next(): Promise<RunnerAction | null> {
    const cancel = await this.sql.query(`select ${COLS} from agent_jobs where cancel_requested and status = any($1::text[]) order by updated_at limit 1`, [[...ACTIVE]]);
    if (cancel[0]) {
      const job = await this.transition(cancel[0].id as string, [...ACTIVE], "canceled", { cancelRequested: false, feedback: null });
      if (job) {
        await this.addEvent(job.id, "canceled");
        return { action: "cancel", job };
      }
    }
    const pick = async (status: JobStatus) => (await this.sql.query(`select ${COLS} from agent_jobs where status = $1 order by updated_at, created_at limit 1`, [status]))[0];

    const approved = await pick("approved");
    if (approved) {
      // Volta a "running" enquanto o agente finaliza (PR pronto, card movido); o mesmo pedido não sai duas vezes.
      const job = await this.transition(approved.id as string, ["approved"], "running");
      if (job) return { action: "approve", job };
    }
    const changes = await pick("changes");
    if (changes) {
      const job = await this.transition(changes.id as string, ["changes"], "running", { feedback: null });
      if (job) return { action: "feedback", job, feedback: (changes.feedback as string | null) ?? "" };
    }
    const queued = await pick("queued");
    if (queued) {
      const job = await this.transition(queued.id as string, ["queued"], "running");
      if (job) {
        await this.addEvent(job.id, "started");
        return { action: "start", job };
      }
    }
    return null;
  }
}
