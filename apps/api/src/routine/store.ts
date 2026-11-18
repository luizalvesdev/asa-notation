import type { Row, SqlClient } from "../sql.js";

export interface WeeklyReview {
  weekStart: string;
  rating: number | null;
  worked: string;
  blocked: string;
  focus: string[];
  applied: boolean;
}

export interface ReviewPatch {
  rating?: number | null;
  worked?: string;
  blocked?: string;
  focus?: string[];
}

function toReview(row: Row): WeeklyReview {
  return {
    weekStart: row.week_start as string,
    rating: row.rating == null ? null : Number(row.rating),
    worked: row.worked as string,
    blocked: row.blocked as string,
    focus: (row.focus as string[]) ?? [],
    applied: row.applied_at != null,
  };
}

const COLUMNS = "week_start::text as week_start, rating, worked, blocked, focus, applied_at";

export class PgRoutineStore {
  constructor(
    private readonly sql: SqlClient,
    private readonly clock: () => number = Date.now,
  ) {}

  async get(weekStart: string): Promise<WeeklyReview | null> {
    const rows = await this.sql.query(`select ${COLUMNS} from weekly_reviews where week_start = $1`, [weekStart]);
    return rows[0] ? toReview(rows[0]) : null;
  }

  async save(weekStart: string, patch: ReviewPatch): Promise<WeeklyReview> {
    const cur = await this.get(weekStart);
    const next = {
      rating: patch.rating !== undefined ? patch.rating : (cur?.rating ?? null),
      worked: patch.worked ?? cur?.worked ?? "",
      blocked: patch.blocked ?? cur?.blocked ?? "",
      focus: patch.focus ?? cur?.focus ?? [],
    };
    await this.sql.query(
      `insert into weekly_reviews (week_start, rating, worked, blocked, focus, updated_at) values ($1, $2, $3, $4, $5::jsonb, $6)
       on conflict (week_start) do update set rating = $2, worked = $3, blocked = $4, focus = $5::jsonb, updated_at = $6`,
      [weekStart, next.rating, next.worked, next.blocked, JSON.stringify(next.focus), new Date(this.clock()).toISOString()],
    );
    return (await this.get(weekStart))!;
  }

  /** Marca como aplicada. Devolve false se já tinha sido (ou se a revisão não existe). */
  async markApplied(weekStart: string): Promise<boolean> {
    const rows = await this.sql.query(`update weekly_reviews set applied_at = $2 where week_start = $1 and applied_at is null returning week_start`, [weekStart, new Date(this.clock()).toISOString()]);
    return rows.length > 0;
  }
}
