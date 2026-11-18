import type { PgPageStore } from "../pages/store.js";
import { UUID_SOURCE, badRequest, isRecord, isUuid, json, notFound, type Route } from "../routing.js";
import { KINDS, type CapturePatch, type Kind } from "./model.js";
import type { PgCaptureStore } from "./store.js";
import { captureToPage } from "./text.js";

const MAX_TEXT = 10_000;
const MAX_BULK = 200;

const ID = `(${UUID_SOURCE})`;

const validText = (value: unknown): value is string => typeof value === "string" && value.trim().length >= 1 && value.length <= MAX_TEXT;
const validKind = (value: unknown): value is Kind | null => value === null || (KINDS as readonly unknown[]).includes(value);

export function captureRoutes(captures: PgCaptureStore, pages: PgPageStore): Route[] {
  return [
    {
      method: "GET",
      pattern: /^\/captures$/,
      access: "session",
      handle: async ({ req }) => {
        const kind = req.query.kind;
        if (kind !== undefined && kind !== "none" && !validKind(kind)) return badRequest("invalid_kind");
        const [items, counts] = await Promise.all([captures.list(kind as Kind | "none" | undefined), captures.counts()]);
        return json(200, { items, counts });
      },
    },
    {
      method: "POST",
      pattern: /^\/captures$/,
      access: "session",
      handle: async ({ req }) => {
        const body = isRecord(req.body) ? req.body : {};
        const text = typeof body.text === "string" ? body.text.trim() : body.text;
        const kind = body.kind ?? null;
        if (!validText(text)) return badRequest("invalid_text");
        if (!validKind(kind)) return badRequest("invalid_kind");
        if (body.id !== undefined && !isUuid(body.id)) return badRequest("invalid_id");
        if (body.createdAt !== undefined && (typeof body.createdAt !== "string" || Number.isNaN(Date.parse(body.createdAt)))) {
          return badRequest("invalid_created_at");
        }
        const capture = await captures.create({ id: body.id as string | undefined, text, kind, createdAt: body.createdAt as string | undefined });
        return json(201, { capture });
      },
    },
    {
      method: "POST",
      pattern: /^\/captures\/bulk$/,
      access: "session",
      handle: async ({ req }) => {
        const body = isRecord(req.body) ? req.body : {};
        const { ids, action } = body;
        if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_BULK || !ids.every(isUuid)) return badRequest("invalid_ids");
        if (action === "archive" || action === "restore") return json(200, { updated: await captures.bulk(ids, { action }) });
        if (action === "kind") {
          if (!validKind(body.kind) || body.kind === undefined) return badRequest("invalid_kind");
          return json(200, { updated: await captures.bulk(ids, { action, kind: body.kind }) });
        }
        return badRequest("invalid_action");
      },
    },
    {
      method: "PATCH",
      pattern: new RegExp(`^/captures/${ID}$`),
      access: "session",
      handle: async ({ req, match }) => {
        const body = isRecord(req.body) ? req.body : {};
        const patch: CapturePatch = {};
        if (body.text !== undefined) {
          const text = typeof body.text === "string" ? body.text.trim() : body.text;
          if (!validText(text)) return badRequest("invalid_text");
          patch.text = text;
        }
        if (body.kind !== undefined) {
          if (!validKind(body.kind)) return badRequest("invalid_kind");
          patch.kind = body.kind;
        }
        if (Object.keys(patch).length === 0) return badRequest("empty_patch");
        const capture = await captures.update(match[1]!, patch);
        return capture ? json(200, { capture }) : notFound();
      },
    },
    {
      method: "POST",
      pattern: new RegExp(`^/captures/${ID}/move$`),
      access: "session",
      handle: async ({ req, match }) => {
        const body = isRecord(req.body) ? req.body : null;
        if (!body || !("parentId" in body)) return badRequest("invalid_parent");
        const parentId = body.parentId;
        if (parentId !== null && !isUuid(parentId)) return badRequest("invalid_parent");
        const capture = await captures.get(match[1]!);
        if (!capture) return notFound();

        const { title, body: doc } = captureToPage(capture.text);
        const page = await pages.create({ parentId, title, icon: null, body: doc });
        if (!page) return json(404, { error: "parent_not_found" });
        if (!(await captures.markMoved(capture.id, page.id))) {
          // Outra requisição moveu antes: não deixa a página duplicada.
          await pages.softDelete(page.id);
          return json(409, { error: "already_moved" });
        }
        return json(200, { page });
      },
    },
  ];
}
