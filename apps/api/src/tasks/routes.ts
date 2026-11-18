import { UUID_SOURCE, badRequest, isRecord, isUuid, json, notFound, type Route } from "../routing.js";
import type { TaskPatch } from "./model.js";
import { daysBetween, isDate, isTime, type Recurrence } from "./recurrence.js";
import type { PgTaskStore } from "./store.js";

const MAX_TITLE_LENGTH = 500;
const MAX_RANGE_DAYS = 62;
const MAX_RESCHEDULE = 200;
const RECURRENCES = new Set<unknown>(["daily", "weekdays", "weekly"]);

const ID = `(${UUID_SOURCE})`;

function validTitle(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 1 && value.length <= MAX_TITLE_LENGTH;
}

const validDate = (value: unknown): value is string | null => value === null || isDate(value);
const validTime = (value: unknown): value is string | null => value === null || isTime(value);
const validRecurrence = (value: unknown): value is Recurrence | null => value === null || RECURRENCES.has(value);

export function taskRoutes(store: PgTaskStore): Route[] {
  return [
    {
      method: "GET",
      pattern: /^\/tasks$/,
      access: "session",
      handle: async ({ req }) => {
        const { from, to, today } = req.query;
        if (!isDate(from) || !isDate(to) || !isDate(today)) return badRequest("invalid_range");
        const span = daysBetween(from, to);
        if (span < 0 || span > MAX_RANGE_DAYS) return badRequest("invalid_range");
        return json(200, await store.list(from, to, today));
      },
    },
    {
      method: "POST",
      pattern: /^\/tasks$/,
      access: "session",
      handle: async ({ req }) => {
        const body = isRecord(req.body) ? req.body : {};
        const title = typeof body.title === "string" ? body.title.trim() : body.title;
        const parentId = body.parentId ?? null;
        const date = body.date ?? null;
        const time = body.time ?? null;
        const recurrence = body.recurrence ?? null;
        const goalId = body.goalId ?? null;
        if (goalId !== null && !isUuid(goalId)) return badRequest("invalid_goal");
        if (!validTitle(title)) return badRequest("invalid_title");
        if (parentId !== null && !isUuid(parentId)) return badRequest("invalid_parent");
        if (!validDate(date)) return badRequest("invalid_date");
        if (!validTime(time)) return badRequest("invalid_time");
        if (!validRecurrence(recurrence)) return badRequest("invalid_recurrence");

        const result = await store.create({ title, parentId, date, time, recurrence, goalId });
        if (result.kind === "ok") return json(201, { task: result.task });
        if (result.kind === "parent_not_found") return json(404, { error: "parent_not_found" });
        if (result.kind === "goal_not_found") return json(404, { error: "goal_not_found" });
        return badRequest("invalid_combination");
      },
    },
    {
      method: "POST",
      pattern: /^\/tasks\/reschedule$/,
      access: "session",
      handle: async ({ req }) => {
        const body = isRecord(req.body) ? req.body : {};
        const { ids, date } = body;
        if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_RESCHEDULE || !ids.every(isUuid)) {
          return badRequest("invalid_ids");
        }
        if (!isDate(date)) return badRequest("invalid_date");
        return json(200, { updated: await store.reschedule(ids, date) });
      },
    },
    {
      method: "PATCH",
      pattern: new RegExp(`^/tasks/${ID}$`),
      access: "session",
      handle: async ({ req, match }) => {
        const body = isRecord(req.body) ? req.body : {};
        const patch: TaskPatch = {};
        if (body.title !== undefined) {
          const title = typeof body.title === "string" ? body.title.trim() : body.title;
          if (!validTitle(title)) return badRequest("invalid_title");
          patch.title = title;
        }
        if (body.date !== undefined) {
          if (!validDate(body.date)) return badRequest("invalid_date");
          patch.date = body.date;
        }
        if (body.time !== undefined) {
          if (!validTime(body.time)) return badRequest("invalid_time");
          patch.time = body.time;
        }
        if (body.recurrence !== undefined) {
          if (!validRecurrence(body.recurrence)) return badRequest("invalid_recurrence");
          patch.recurrence = body.recurrence;
        }
        if (body.goalId !== undefined) {
          if (body.goalId !== null && !isUuid(body.goalId)) return badRequest("invalid_goal");
          patch.goalId = body.goalId;
        }
        if (Object.keys(patch).length === 0) return badRequest("empty_patch");

        const result = await store.update(match[1]!, patch);
        if (result.kind === "ok") return json(200, { task: result.task });
        if (result.kind === "not_found") return notFound();
        if (result.kind === "goal_not_found") return json(404, { error: "goal_not_found" });
        return badRequest("invalid_combination");
      },
    },
    {
      method: "POST",
      pattern: new RegExp(`^/tasks/${ID}/done$`),
      access: "session",
      handle: async ({ req, match }) => {
        const body = isRecord(req.body) ? req.body : {};
        if (typeof body.done !== "boolean") return badRequest("invalid_done");
        if (body.date !== undefined && !isDate(body.date)) return badRequest("invalid_date");
        const result = await store.setDone(match[1]!, body.done, (body.date as string | undefined) ?? null);
        if (result === "ok") return json(200, { done: body.done });
        return result === "not_found" ? notFound() : badRequest("invalid_date");
      },
    },
    {
      method: "DELETE",
      pattern: new RegExp(`^/tasks/${ID}$`),
      access: "session",
      handle: async ({ match }) => ((await store.softDelete(match[1]!)) ? json(200, { deleted: 1 }) : notFound()),
    },
    {
      method: "POST",
      pattern: new RegExp(`^/tasks/${ID}/restore$`),
      access: "session",
      handle: async ({ match }) => {
        const task = await store.restore(match[1]!);
        return task ? json(200, { task }) : notFound();
      },
    },
  ];
}
