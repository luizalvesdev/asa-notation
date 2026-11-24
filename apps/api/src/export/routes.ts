import { json, type Route } from "../routing.js";
import type { SqlClient } from "../sql.js";

/** Tudo que o dono tem, em um JSON só. Sem segredos (senha, tokens) e sem o que está na lixeira. */
export function exportRoutes(sql: SqlClient, now: () => number): Route[] {
  return [
    {
      method: "GET",
      pattern: /^\/export$/,
      access: "session",
      handle: async () => {
        const [pages, links, tasks, goals, captures, decks, cards, reviews, settings] = await Promise.all([
          sql.query(`select id, parent_id, title, icon, favorite, position, body, created_at, updated_at from pages where deleted_at is null order by position, created_at, id`),
          sql.query(`select from_page, to_title from page_links order by from_page, to_title`),
          sql.query(`select id, parent_id, goal_id, title, due_date::text as due_date, to_char(due_time, 'HH24:MI') as due_time, recurrence, done_at, created_at from tasks where deleted_at is null order by created_at, id`),
          sql.query(`select id, title, description, due_date::text as due_date, done_at, created_at from goals where deleted_at is null order by created_at, id`),
          sql.query(`select id, text, kind, tags, created_at, archived_at, done_at, moved_page_id from captures order by created_at, id`),
          sql.query(`select id, title, goal_id, created_at from decks where deleted_at is null order by created_at, id`),
          sql.query(`select id, deck_id, kind, front, back, source_page_id, source_key, fsrs, due_at, state, created_at from cards where deleted_at is null order by created_at, id`),
          sql.query(`select card_id, rating, state_before, reviewed_at, duration_ms from review_logs order by id`),
          sql.query(`select data from settings where id`),
        ]);
        return json(200, {
          version: 1,
          exportedAt: new Date(now()).toISOString(),
          pages,
          pageLinks: links,
          tasks,
          goals,
          captures,
          decks,
          cards,
          reviewLogs: reviews,
          settings: settings[0]?.data ?? {},
        });
      },
    },
  ];
}
