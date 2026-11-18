import type { Row, SqlClient } from "../sql.js";
import type { Candidate } from "./extract.js";
import type { Card, CardKind, Deck, NewCardInput, Overview, QueueCard, Stats, WeakCard } from "./model.js";
import * as fsrs from "./scheduler.js";
import type { Grade, StoredCard } from "./scheduler.js";

export const NEW_PER_DAY = 10;
const QUEUE_LIMIT = 100;
const DEFAULT_SECONDS = 40;

const CARD_COLUMNS = `c.id, c.deck_id, c.kind, c.front, c.back, c.source_page_id, c.state, c.due_at, c.fsrs,
  (select p.title from pages p where p.id = c.source_page_id and p.deleted_at is null) as source_title`;

function toCard(row: Row): Card {
  return {
    id: row.id as string,
    deckId: (row.deck_id as string | null) ?? null,
    kind: row.kind as CardKind,
    front: row.front as string,
    back: row.back as string,
    sourcePageId: (row.source_page_id as string | null) ?? null,
    sourceTitle: (row.source_title as string | null) ?? null,
    state: Number(row.state),
    dueAt: new Date(row.due_at as string | Date).toISOString(),
  };
}

const toWeak = (row: Row): WeakCard => ({ id: row.id as string, front: row.front as string, kind: row.kind as CardKind, lapses: Number(row.lapses) });

export type ReviewResult = { kind: "ok"; dueAt: string; state: number } | { kind: "not_found" };
export type DeckResult = { kind: "ok"; deck: Deck } | { kind: "not_found" } | { kind: "goal_not_found" };

export class PgStudyStore {
  constructor(
    private readonly sql: SqlClient,
    private readonly clock: () => number = Date.now,
  ) {}

  private now(): Date {
    return new Date(this.clock());
  }

  // ---- trilhas -------------------------------------------------------------

  private async decks(now: Date): Promise<Deck[]> {
    const rows = await this.sql.query(
      `select d.id, d.title, d.goal_id,
              (select g.title from goals g where g.id = d.goal_id and g.deleted_at is null) as goal_title,
              count(c.id)::int as total,
              (count(c.id) filter (where c.state <> 0 and c.due_at <= $1))::int as due,
              (count(c.id) filter (where c.state = 2))::int as learned
         from decks d left join cards c on c.deck_id = d.id and c.deleted_at is null
        where d.deleted_at is null group by d.id order by d.created_at, d.id`,
      [now.toISOString()],
    );
    return rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      goalId: (r.goal_id as string | null) ?? null,
      goalTitle: (r.goal_title as string | null) ?? null,
      cards: Number(r.total),
      due: Number(r.due),
      learned: Number(r.learned),
    }));
  }

  private async goalExists(id: string): Promise<boolean> {
    return (await this.sql.query(`select 1 from goals where id = $1 and deleted_at is null`, [id])).length > 0;
  }

  async deckExists(id: string): Promise<boolean> {
    return (await this.sql.query(`select 1 from decks where id = $1 and deleted_at is null`, [id])).length > 0;
  }

  async createDeck(title: string, goalId: string | null): Promise<DeckResult> {
    if (goalId && !(await this.goalExists(goalId))) return { kind: "goal_not_found" };
    const now = this.now();
    const rows = await this.sql.query(`insert into decks (title, goal_id, created_at, updated_at) values ($1, $2, $3, $3) returning id`, [title, goalId, now.toISOString()]);
    return { kind: "ok", deck: (await this.decks(now)).find((d) => d.id === rows[0]!.id)! };
  }

  async updateDeck(id: string, patch: { title?: string; goalId?: string | null }): Promise<DeckResult> {
    const now = this.now();
    const cur = (await this.decks(now)).find((d) => d.id === id);
    if (!cur) return { kind: "not_found" };
    const goalId = patch.goalId !== undefined ? patch.goalId : cur.goalId;
    if (goalId && !(await this.goalExists(goalId))) return { kind: "goal_not_found" };
    await this.sql.query(`update decks set title = $2, goal_id = $3, updated_at = $4 where id = $1`, [id, patch.title ?? cur.title, goalId, now.toISOString()]);
    return { kind: "ok", deck: (await this.decks(now)).find((d) => d.id === id)! };
  }

  async deleteDeck(id: string): Promise<boolean> {
    const now = this.now().toISOString();
    const rows = await this.sql.query(`update decks set deleted_at = $2, updated_at = $2 where id = $1 and deleted_at is null returning id`, [id, now]);
    if (rows.length === 0) return false;
    // Os cards continuam existindo, sem trilha.
    await this.sql.query(`update cards set deck_id = null, updated_at = $2 where deck_id = $1`, [id, now]);
    return true;
  }

  // ---- cards ---------------------------------------------------------------

  async createCards(items: NewCardInput[]): Promise<{ created: number; skipped: number }> {
    const now = this.now();
    let created = 0;
    for (const item of items) {
      const state = await fsrs.newCard(now);
      const rows = await this.sql.query(
        `insert into cards (deck_id, kind, front, back, source_page_id, source_key, fsrs, due_at, state, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, 0, $9, $9)
         on conflict (source_page_id, source_key) do nothing returning id`,
        [item.deckId, item.kind, item.front, item.back, item.sourcePageId ?? null, item.sourceKey ?? null, JSON.stringify(state), state.dueAt, now.toISOString()],
      );
      created += rows.length;
    }
    return { created, skipped: items.length - created };
  }

  async deleteCard(id: string): Promise<boolean> {
    return (await this.sql.query(`update cards set deleted_at = $2, updated_at = $2 where id = $1 and deleted_at is null returning id`, [id, this.now().toISOString()])).length > 0;
  }

  async listCards(deckId: string | null | undefined): Promise<Card[]> {
    const filter = deckId === undefined ? "" : deckId === null ? "and c.deck_id is null" : "and c.deck_id = $1";
    const rows = await this.sql.query(
      `select ${CARD_COLUMNS} from cards c where c.deleted_at is null ${filter} order by c.created_at desc, c.id desc limit 500`,
      typeof deckId === "string" ? [deckId] : [],
    );
    return rows.map(toCard);
  }

  /** Cards que a página gera pelas marcações, dizendo quais já existem. */
  async existingKeys(pageId: string, keys: string[]): Promise<Set<string>> {
    if (keys.length === 0) return new Set();
    const rows = await this.sql.query(
      `select source_key from cards where source_page_id = $1 and source_key = any($2::text[]) and deleted_at is null`,
      [pageId, keys],
    );
    return new Set(rows.map((r) => r.source_key as string));
  }

  async pageBody(pageId: string): Promise<unknown | undefined> {
    const rows = await this.sql.query(`select body from pages where id = $1 and deleted_at is null`, [pageId]);
    return rows[0] ? (rows[0].body ?? null) : undefined;
  }

  async candidatesExist(pageId: string, candidates: Candidate[]): Promise<boolean[]> {
    const existing = await this.existingKeys(pageId, candidates.map((c) => c.sourceKey));
    return candidates.map((c) => existing.has(c.sourceKey));
  }

  // ---- revisão -------------------------------------------------------------

  private async newLeft(dayStart: Date): Promise<number> {
    const rows = await this.sql.query(`select count(*)::int as n from review_logs where state_before = 0 and reviewed_at >= $1`, [dayStart.toISOString()]);
    return Math.max(0, NEW_PER_DAY - Number(rows[0]?.n ?? 0));
  }

  async overview(dayStart: Date): Promise<Overview> {
    const now = this.now();
    const [counts, newLeft, avg, decks, weak] = await Promise.all([
      this.sql.query(
        `select (count(*) filter (where state <> 0 and due_at <= $1))::int as due_review,
                (count(*) filter (where state = 0))::int as new_total, count(*)::int as total
           from cards where deleted_at is null`,
        [now.toISOString()],
      ),
      this.newLeft(dayStart),
      this.sql.query(`select avg(duration_ms) as ms from (select duration_ms from review_logs where duration_ms is not null order by id desc limit 200) t`),
      this.decks(now),
      this.sql.query(
        `select c.id, c.front, c.kind, count(*)::int as lapses from cards c join review_logs r on r.card_id = c.id
          where r.rating = 1 and r.reviewed_at >= $1::timestamptz - interval '7 days' and c.deleted_at is null
          group by c.id having count(*) >= 2 order by count(*) desc, c.id limit 5`,
        [now.toISOString()],
      ),
    ]);
    const c = counts[0]!;
    const ms = avg[0]?.ms == null ? null : Number(avg[0].ms);
    return {
      dueReview: Number(c.due_review),
      newAvailable: Math.min(Number(c.new_total), newLeft),
      totalCards: Number(c.total),
      avgSeconds: ms === null ? DEFAULT_SECONDS : Math.max(5, Math.round(ms / 1000)),
      decks,
      weak: weak.map(toWeak),
    };
  }

  async queue(dayStart: Date): Promise<QueueCard[]> {
    const now = this.now();
    const newLeft = await this.newLeft(dayStart);
    const [due, fresh] = await Promise.all([
      this.sql.query(`select ${CARD_COLUMNS} from cards c where c.deleted_at is null and c.state <> 0 and c.due_at <= $1 order by c.due_at, c.id limit ${QUEUE_LIMIT}`, [now.toISOString()]),
      newLeft === 0 ? Promise.resolve([] as Row[]) : this.sql.query(`select ${CARD_COLUMNS} from cards c where c.deleted_at is null and c.state = 0 order by c.created_at, c.id limit $1`, [newLeft]),
    ]);
    const rows = [...due, ...fresh].slice(0, QUEUE_LIMIT);
    return Promise.all(rows.map(async (row) => ({ ...toCard(row), preview: await fsrs.preview(row.fsrs as StoredCard, now) })));
  }

  async review(id: string, grade: Grade, durationMs: number | null): Promise<ReviewResult> {
    const rows = await this.sql.query(`select c.state, c.fsrs from cards c where c.id = $1 and c.deleted_at is null`, [id]);
    const cur = rows[0];
    if (!cur) return { kind: "not_found" };
    const now = this.now();
    const next = await fsrs.review(cur.fsrs as StoredCard, grade, now);
    await this.sql.query(`update cards set fsrs = $2::jsonb, due_at = $3, state = $4, updated_at = $5 where id = $1`, [id, JSON.stringify(next), next.dueAt, next.state, now.toISOString()]);
    await this.sql.query(`insert into review_logs (card_id, rating, state_before, reviewed_at, duration_ms) values ($1, $2, $3, $4, $5)`, [id, grade, Number(cur.state), now.toISOString(), durationMs]);
    return { kind: "ok", dueAt: next.dueAt, state: next.state };
  }

  // ---- estatísticas ----------------------------------------------------------

  async stats(tz: string, days: number): Promise<Stats> {
    const now = this.now().toISOString();
    const [perDay, retention, states, hardest, upcoming] = await Promise.all([
      this.sql.query(
        `select to_char((reviewed_at at time zone $2)::date, 'YYYY-MM-DD') as day, count(*)::int as n,
                coalesce(sum(duration_ms), 0)::bigint as ms, (count(*) filter (where rating >= 2))::int as ok
           from review_logs where reviewed_at >= $1::timestamptz - ($3::int * interval '1 day') group by 1 order by 1`,
        [now, tz, days],
      ),
      this.sql.query(
        `select (count(*) filter (where state_before = 2))::int as n, (count(*) filter (where state_before = 2 and rating >= 2))::int as ok
           from review_logs where reviewed_at >= $1::timestamptz - ($2::int * interval '1 day')`,
        [now, days],
      ),
      this.sql.query(`select state, count(*)::int as n from cards where deleted_at is null group by state`),
      this.sql.query(
        `select c.id, c.front, c.kind, count(*)::int as lapses from cards c join review_logs r on r.card_id = c.id
          where r.rating = 1 and r.reviewed_at >= $1::timestamptz - ($2::int * interval '1 day') and c.deleted_at is null
          group by c.id order by count(*) desc, c.id limit 5`,
        [now, days],
      ),
      this.sql.query(
        `select to_char(greatest((due_at at time zone $2)::date, (($1::timestamptz) at time zone $2)::date), 'YYYY-MM-DD') as day, count(*)::int as n
           from cards where deleted_at is null and state <> 0
            and (due_at at time zone $2)::date < (($1::timestamptz) at time zone $2)::date + 7 group by 1 order by 1`,
        [now, tz],
      ),
    ]);

    const byState = new Map(states.map((r) => [Number(r.state), Number(r.n)]));
    const totalReviews = perDay.reduce((sum, r) => sum + Number(r.n), 0);
    const r = retention[0]!;
    return {
      days: perDay.map((d) => ({ day: d.day as string, reviews: Number(d.n), seconds: Math.round(Number(d.ms) / 1000), remembered: Number(d.ok) })),
      retention: Number(r.n) === 0 ? null : Number(r.ok) / Number(r.n),
      reviews: totalReviews,
      seconds: perDay.reduce((sum, d) => sum + Math.round(Number(d.ms) / 1000), 0),
      states: { new: byState.get(0) ?? 0, learning: byState.get(1) ?? 0, review: byState.get(2) ?? 0, relearning: byState.get(3) ?? 0 },
      hardest: hardest.map(toWeak),
      upcoming: upcoming.map((u) => ({ day: u.day as string, due: Number(u.n) })),
    };
  }
}
