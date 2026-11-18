import { parseCanvas, validCover } from "../canvas/schema.js";
import { defaultSchema, parseProps, parseSchema, type Schema } from "../databases/schema.js";
import { UUID_SOURCE, badRequest, isRecord, isUuid, json, notFound, type Route } from "../routing.js";
import type { MoveTarget, PagePatch } from "./model.js";
import type { PgPageStore } from "./store.js";

const MAX_TITLE_LENGTH = 500;
const MAX_ICON_LENGTH = 16;
const MAX_BODY_BYTES = 500_000;
const SEARCH_DEFAULT_LIMIT = 20;
const SEARCH_MAX_LIMIT = 50;
const SEARCH_MAX_QUERY = 200;

const ID = `(${UUID_SOURCE})`;

function validTitle(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_TITLE_LENGTH;
}

function validIcon(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length >= 1 && value.length <= MAX_ICON_LENGTH);
}

function validBody(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.type === "doc" && JSON.stringify(value).length <= MAX_BODY_BYTES;
}

function parseLimit(raw: string | undefined): number | null {
  if (raw === undefined) return SEARCH_DEFAULT_LIMIT;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value >= 1 && value <= SEARCH_MAX_LIMIT ? value : null;
}

export function pageRoutes(store: PgPageStore): Route[] {
  return [
    {
      method: "GET",
      pattern: /^\/pages\/tree$/,
      access: "session",
      handle: async () => json(200, { pages: await store.tree() }),
    },
    {
      method: "GET",
      pattern: /^\/pages\/search$/,
      access: "session",
      handle: async ({ req }) => {
        const q = req.query.q ?? "";
        const limit = parseLimit(req.query.limit);
        if (q.length > SEARCH_MAX_QUERY || limit === null) return badRequest("invalid_query");
        return json(200, { hits: await store.search(q, limit) });
      },
    },
    {
      method: "GET",
      pattern: /^\/pages\/trash$/,
      access: "session",
      handle: async () => json(200, { items: await store.trash() }),
    },
    {
      method: "POST",
      pattern: /^\/pages$/,
      access: "session",
      handle: async ({ req }) => {
        const body = isRecord(req.body) ? req.body : {};
        const parentId = body.parentId ?? null;
        const title = body.title ?? "";
        const icon = body.icon ?? null;
        const doc = body.body ?? null;
        const kind = body.kind ?? "page";
        if (kind !== "page" && kind !== "database" && kind !== "row" && kind !== "canvas") return badRequest("invalid_kind");
        const cover = body.cover ?? null;
        if (!validCover(cover)) return badRequest("invalid_cover");
        if (parentId !== null && !isUuid(parentId)) return badRequest("invalid_parent");
        if (!validTitle(title)) return badRequest("invalid_title");
        if (!validIcon(icon)) return badRequest("invalid_icon");
        let content: unknown = doc;
        if (kind === "canvas") {
          const parsed = parseCanvas(doc ?? { type: "canvas", shapes: [] });
          if (typeof parsed === "string") return badRequest(parsed);
          content = parsed;
        } else if (doc !== null && !validBody(doc)) return badRequest("invalid_body");

        let props: Record<string, unknown> = {};
        let schema: Schema | undefined;
        if (parentId !== null) {
          const parent = await store.get(parentId);
          if (!parent) return json(404, { error: "parent_not_found" });
          // Linhas não têm filhas.
          if (parent.kind === "row") return badRequest("invalid_parent");
          if (kind === "row") {
            if (parent.kind !== "database") return badRequest("invalid_parent");
            const parsed = parseProps(parent.schema as Schema, body.props ?? {});
            if (typeof parsed === "string") return badRequest(parsed);
            props = parsed;
          }
        } else if (kind === "row") return badRequest("invalid_parent");
        if (kind !== "row" && body.props !== undefined) return badRequest("invalid_props");
        if (kind === "database") {
          const parsed = body.schema === undefined ? defaultSchema() : parseSchema(body.schema);
          if (typeof parsed === "string") return badRequest(parsed);
          schema = parsed;
        } else if (body.schema !== undefined) return badRequest("invalid_schema");
        const page = await store.create({ parentId, title, icon, body: content, kind, cover, props, schema });
        return page ? json(201, { page }) : json(404, { error: "parent_not_found" });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^/pages/${ID}$`),
      access: "session",
      handle: async ({ match }) => {
        const page = await store.get(match[1]!);
        return page ? json(200, { page }) : notFound();
      },
    },
    {
      method: "PATCH",
      pattern: new RegExp(`^/pages/${ID}$`),
      access: "session",
      handle: async ({ req, match }) => {
        const body = isRecord(req.body) ? req.body : {};
        const patch: PagePatch = {};
        if (body.title !== undefined) {
          if (!validTitle(body.title)) return badRequest("invalid_title");
          patch.title = body.title;
        }
        if (body.icon !== undefined) {
          if (!validIcon(body.icon)) return badRequest("invalid_icon");
          patch.icon = body.icon;
        }
        if (body.favorite !== undefined) {
          if (typeof body.favorite !== "boolean") return badRequest("invalid_favorite");
          patch.favorite = body.favorite;
        }
        if (body.cover !== undefined) {
          if (!validCover(body.cover)) return badRequest("invalid_cover");
          patch.cover = body.cover;
        }
        if (body.body !== undefined) {
          if (isRecord(body.body) && body.body.type === "canvas") {
            // Quadro: só em páginas canvas, e com formas válidas.
            const current = await store.get(match[1]!);
            if (!current) return notFound();
            if (current.kind !== "canvas") return badRequest("invalid_body");
            const parsed = parseCanvas(body.body);
            if (typeof parsed === "string") return badRequest(parsed);
            patch.body = parsed;
          } else {
            if (!validBody(body.body)) return badRequest("invalid_body");
            patch.body = body.body;
          }
        }
        let baseRev: number | undefined;
        if (body.baseRev !== undefined) {
          if (typeof body.baseRev !== "number" || !Number.isSafeInteger(body.baseRev) || body.baseRev < 0) {
            return badRequest("invalid_base_rev");
          }
          baseRev = body.baseRev;
        }
        if (body.props !== undefined || body.schema !== undefined) {
          const current = await store.get(match[1]!);
          if (!current) return notFound();
          if (body.props !== undefined) {
            if (current.kind !== "row" || !current.parentId) return badRequest("invalid_props");
            const parent = await store.get(current.parentId);
            if (!parent) return badRequest("invalid_props");
            const parsed = parseProps(parent.schema as Schema, body.props);
            if (typeof parsed === "string") return badRequest(parsed);
            patch.props = parsed;
          }
          if (body.schema !== undefined) {
            if (current.kind !== "database") return badRequest("invalid_schema");
            const parsed = parseSchema(body.schema);
            if (typeof parsed === "string") return badRequest(parsed);
            patch.schema = parsed;
          }
        }
        if (Object.keys(patch).length === 0) return badRequest("empty_patch");

        const result = await store.update(match[1]!, patch, baseRev);
        if (result.kind === "ok") return json(200, { page: result.page });
        if (result.kind === "conflict") return json(409, { error: "conflict", page: result.page });
        return notFound();
      },
    },
    {
      method: "POST",
      pattern: new RegExp(`^/pages/${ID}/move$`),
      access: "session",
      handle: async ({ req, match }) => {
        const body = isRecord(req.body) ? req.body : null;
        if (!body || !("parentId" in body)) return badRequest("invalid_parent");
        const { parentId, before, after } = body;
        if (parentId !== null && !isUuid(parentId)) return badRequest("invalid_parent");
        if (before !== undefined && !isUuid(before)) return badRequest("invalid_anchor");
        if (after !== undefined && !isUuid(after)) return badRequest("invalid_anchor");
        if (before !== undefined && after !== undefined) return badRequest("invalid_anchor");
        const target: MoveTarget = { parentId };
        if (before !== undefined) target.before = before;
        if (after !== undefined) target.after = after;

        const result = await store.move(match[1]!, target);
        switch (result.kind) {
          case "ok":
            return json(200, { page: result.page });
          case "not_found":
            return notFound();
          case "parent_not_found":
            return json(404, { error: "parent_not_found" });
          case "cycle":
            return json(409, { error: "cycle" });
          case "anchor_invalid":
            return badRequest("invalid_anchor");
          case "row_locked":
            return json(409, { error: "row_locked" });
        }
      },
    },
    {
      method: "DELETE",
      pattern: new RegExp(`^/pages/${ID}$`),
      access: "session",
      handle: async ({ match }) => {
        const count = await store.softDelete(match[1]!);
        return count > 0 ? json(200, { deleted: count }) : notFound();
      },
    },
    {
      method: "POST",
      pattern: new RegExp(`^/pages/${ID}/restore$`),
      access: "session",
      handle: async ({ match }) => {
        const page = await store.restore(match[1]!);
        return page ? json(200, { page }) : notFound();
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^/pages/${ID}/versions$`),
      access: "session",
      handle: async ({ match }) => ((await store.get(match[1]!)) ? json(200, { versions: await store.versions(match[1]!) }) : notFound()),
    },
    {
      method: "GET",
      pattern: new RegExp(`^/pages/${ID}/versions/(\\d{1,15})$`),
      access: "session",
      handle: async ({ match }) => {
        const version = await store.version(match[1]!, Number(match[2]));
        return version ? json(200, { version }) : notFound();
      },
    },
    {
      method: "POST",
      pattern: new RegExp(`^/pages/${ID}/versions/(\\d{1,15})/restore$`),
      access: "session",
      handle: async ({ match }) => {
        const page = await store.restoreVersion(match[1]!, Number(match[2]));
        return page ? json(200, { page }) : notFound();
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^/pages/${ID}/share$`),
      access: "session",
      handle: async ({ match }) => json(200, { share: await store.shareOf(match[1]!) }),
    },
    {
      method: "POST",
      pattern: new RegExp(`^/pages/${ID}/share$`),
      access: "session",
      handle: async ({ match }) => {
        const share = await store.share(match[1]!);
        return share ? json(200, { share }) : notFound();
      },
    },
    {
      method: "DELETE",
      pattern: new RegExp(`^/pages/${ID}/share$`),
      access: "session",
      handle: async ({ match }) => ((await store.unshare(match[1]!)) ? json(200, { unshared: 1 }) : notFound()),
    },
    {
      method: "GET",
      pattern: /^\/public\/([A-Za-z0-9_-]{8,32})$/,
      access: "public",
      handle: async ({ match }) => {
        const page = await store.publicPage(match[1]!);
        return page ? json(200, { page }) : notFound();
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^/databases/${ID}/rows$`),
      access: "session",
      handle: async ({ match }) => {
        if ((await store.schemaOf(match[1]!)) === null) return notFound();
        return json(200, { rows: await store.rows(match[1]!) });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^/pages/${ID}/backlinks$`),
      access: "session",
      handle: async ({ match }) => json(200, { pages: await store.backlinks(match[1]!) }),
    },
  ];
}
