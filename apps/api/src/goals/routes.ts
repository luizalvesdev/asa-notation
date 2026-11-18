import { UUID_SOURCE, badRequest, isRecord, json, notFound, type Route } from "../routing.js";
import { isDate } from "../tasks/recurrence.js";
import type { PgTaskStore } from "../tasks/store.js";
import type { GoalPatch } from "./model.js";
import type { PgGoalStore } from "./store.js";

const MAX_TITLE_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 5000;

const ID = `(${UUID_SOURCE})`;

const validTitle = (value: unknown): value is string => typeof value === "string" && value.trim().length >= 1 && value.length <= MAX_TITLE_LENGTH;
const validDescription = (value: unknown): value is string => typeof value === "string" && value.length <= MAX_DESCRIPTION_LENGTH;
const validDate = (value: unknown): value is string | null => value === null || isDate(value);

export function goalRoutes(goals: PgGoalStore, tasks: PgTaskStore): Route[] {
  return [
    {
      method: "GET",
      pattern: /^\/goals$/,
      access: "session",
      handle: async () => json(200, { goals: await goals.list() }),
    },
    {
      method: "POST",
      pattern: /^\/goals$/,
      access: "session",
      handle: async ({ req }) => {
        const body = isRecord(req.body) ? req.body : {};
        const title = typeof body.title === "string" ? body.title.trim() : body.title;
        const description = body.description ?? "";
        const dueDate = body.dueDate ?? null;
        if (!validTitle(title)) return badRequest("invalid_title");
        if (!validDescription(description)) return badRequest("invalid_description");
        if (!validDate(dueDate)) return badRequest("invalid_date");
        return json(201, { goal: await goals.create({ title, description, dueDate }) });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^/goals/${ID}$`),
      access: "session",
      handle: async ({ match }) => {
        const goal = await goals.get(match[1]!);
        return goal ? json(200, { goal, tasks: await tasks.forGoal(goal.id) }) : notFound();
      },
    },
    {
      method: "PATCH",
      pattern: new RegExp(`^/goals/${ID}$`),
      access: "session",
      handle: async ({ req, match }) => {
        const body = isRecord(req.body) ? req.body : {};
        const patch: GoalPatch = {};
        if (body.title !== undefined) {
          const title = typeof body.title === "string" ? body.title.trim() : body.title;
          if (!validTitle(title)) return badRequest("invalid_title");
          patch.title = title;
        }
        if (body.description !== undefined) {
          if (!validDescription(body.description)) return badRequest("invalid_description");
          patch.description = body.description;
        }
        if (body.dueDate !== undefined) {
          if (!validDate(body.dueDate)) return badRequest("invalid_date");
          patch.dueDate = body.dueDate;
        }
        if (body.done !== undefined) {
          if (typeof body.done !== "boolean") return badRequest("invalid_done");
          patch.done = body.done;
        }
        if (Object.keys(patch).length === 0) return badRequest("empty_patch");
        const goal = await goals.update(match[1]!, patch);
        return goal ? json(200, { goal }) : notFound();
      },
    },
    {
      method: "DELETE",
      pattern: new RegExp(`^/goals/${ID}$`),
      access: "session",
      handle: async ({ match }) => ((await goals.softDelete(match[1]!)) ? json(200, { deleted: 1 }) : notFound()),
    },
    {
      method: "POST",
      pattern: new RegExp(`^/goals/${ID}/restore$`),
      access: "session",
      handle: async ({ match }) => {
        const goal = await goals.restore(match[1]!);
        return goal ? json(200, { goal }) : notFound();
      },
    },
  ];
}
