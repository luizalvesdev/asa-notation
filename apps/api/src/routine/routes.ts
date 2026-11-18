import { badRequest, isRecord, json, type Route } from "../routing.js";
import { dailyActivity } from "../progress/activity.js";
import { addDays, isDate } from "../tasks/recurrence.js";
import type { PgTaskStore } from "../tasks/store.js";
import { validTimeZone } from "../settings/routes.js";
import { verdict, weekMetrics } from "./metrics.js";
import type { PgRoutineStore, ReviewPatch } from "./store.js";
import type { SqlClient } from "../sql.js";

const MAX_TEXT = 2000;
const MAX_FOCUS = 3;
const MAX_FOCUS_LENGTH = 200;

export function routineRoutes(store: PgRoutineStore, tasks: PgTaskStore, sql: SqlClient): Route[] {
  return [
    {
      method: "GET",
      pattern: /^\/routine\/week$/,
      access: "session",
      handle: async ({ req }) => {
        const start = req.query.start;
        const tz = req.query.tz ?? "UTC";
        if (!isDate(start) || !validTimeZone(tz)) return badRequest("invalid_query");
        const end = addDays(start, 6);
        const [activity, list, review] = await Promise.all([dailyActivity(sql, start, end, tz), tasks.list(start, end, end), store.get(start)]);
        const metrics = weekMetrics(start, activity, list.days.filter((t) => t.done).length, list.days.length);
        return json(200, { start, metrics, ...verdict(metrics), review });
      },
    },
    {
      method: "PUT",
      pattern: /^\/routine\/review$/,
      access: "session",
      handle: async ({ req }) => {
        const body = isRecord(req.body) ? req.body : {};
        if (!isDate(body.weekStart)) return badRequest("invalid_week");
        const patch: ReviewPatch = {};
        if (body.rating !== undefined) {
          if (body.rating !== null && !(Number.isInteger(body.rating) && (body.rating as number) >= 1 && (body.rating as number) <= 5)) return badRequest("invalid_rating");
          patch.rating = body.rating as number | null;
        }
        for (const key of ["worked", "blocked"] as const) {
          const value = body[key];
          if (value === undefined) continue;
          if (typeof value !== "string" || value.length > MAX_TEXT) return badRequest(`invalid_${key}`);
          patch[key] = value;
        }
        if (body.focus !== undefined) {
          if (!Array.isArray(body.focus) || body.focus.length > MAX_FOCUS || !body.focus.every((f) => typeof f === "string" && f.trim().length > 0 && f.length <= MAX_FOCUS_LENGTH)) return badRequest("invalid_focus");
          patch.focus = (body.focus as string[]).map((f) => f.trim());
        }
        if (Object.keys(patch).length === 0) return badRequest("empty_patch");
        return json(200, { review: await store.save(body.weekStart, patch) });
      },
    },
    {
      method: "POST",
      pattern: /^\/routine\/review\/apply$/,
      access: "session",
      handle: async ({ req }) => {
        const body = isRecord(req.body) ? req.body : {};
        if (!isDate(body.weekStart)) return badRequest("invalid_week");
        const review = await store.get(body.weekStart);
        if (!review || review.focus.length === 0) return badRequest("no_focus");
        if (!(await store.markApplied(body.weekStart))) return json(409, { error: "already_applied" });
        // O foco vira tarefas para o primeiro dia da semana seguinte.
        const date = addDays(body.weekStart, 7);
        for (const title of review.focus) await tasks.create({ title, parentId: null, date, time: null, recurrence: null, goalId: null });
        return json(200, { created: review.focus.length, date });
      },
    },
  ];
}
