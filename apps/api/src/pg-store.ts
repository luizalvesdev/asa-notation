import type { ChangeFeed, Page, PageKind, PageOrigin, SearchHit, TreeNode } from "@asa/core";
import type { Row, SqlClient } from "./sql.js";
import type { NewPage, PagePatch, PageStore, UpdateResult } from "./store.js";

const PAGE_COLUMNS =
  "id, parent_id, database_id, kind, title, body, props, origin, rev, created_at, updated_at, deleted_at";

const SEARCH_VECTOR = "to_tsvector('portuguese', title || ' ' || body_text)";

function iso(value: unknown): string {
  return new Date(value as string | Date).toISOString();
}

function toPage(row: Row): Page {
  return {
    id: row.id as string,
    parentId: (row.parent_id as string | null) ?? null,
    databaseId: (row.database_id as string | null) ?? null,
    kind: row.kind as PageKind,
    title: row.title as string,
    body: row.body ?? null,
    props: (row.props as Record<string, unknown>) ?? {},
    origin: row.origin as PageOrigin,
    rev: Number(row.rev),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    deletedAt: row.deleted_at == null ? null : iso(row.deleted_at),
  };
}

export class PgPageStore implements PageStore {
  constructor(private readonly sql: SqlClient) {}

  async head(): Promise<number> {
    const rows = await this.sql.query("select coalesce(max(rev), 0) as seq from pages");
    return Number(rows[0]?.seq ?? 0);
  }

  async changes(since: number, limit: number): Promise<ChangeFeed> {
    const rows = await this.sql.query(
      `select ${PAGE_COLUMNS} from pages where rev > $1 order by rev asc limit $2`,
      [since, limit + 1],
    );
    const hasMore = rows.length > limit;
    const pages = rows.slice(0, limit).map(toPage);
    const last = pages[pages.length - 1];
    return { pages, next: last ? last.rev : since, hasMore };
  }

  async get(id: string): Promise<Page | null> {
    const rows = await this.sql.query(`select ${PAGE_COLUMNS} from pages where id = $1 and deleted_at is null`, [id]);
    return rows[0] ? toPage(rows[0]) : null;
  }

  async tree(): Promise<TreeNode[]> {
    const rows = await this.sql.query(
      `select id, parent_id, kind, title, rev, updated_at from pages
       where deleted_at is null and database_id is null order by created_at asc, id asc`,
    );
    return rows.map((row) => ({
      id: row.id as string,
      parentId: (row.parent_id as string | null) ?? null,
      kind: row.kind as PageKind,
      title: row.title as string,
      rev: Number(row.rev),
      updatedAt: iso(row.updated_at),
    }));
  }

  async create(input: NewPage): Promise<Page> {
    const rows = await this.sql.query(
      `insert into pages (parent_id, kind, title, body, body_text, props)
       values ($1, $2, $3, $4::jsonb, $5, $6::jsonb) returning ${PAGE_COLUMNS}`,
      [
        input.parentId,
        input.kind,
        input.title,
        input.body === null ? null : JSON.stringify(input.body),
        input.bodyText,
        JSON.stringify(input.props),
      ],
    );
    return toPage(rows[0]!);
  }

  async update(id: string, patch: PagePatch, baseRev: number): Promise<UpdateResult> {
    const params: unknown[] = [id, baseRev];
    const sets: string[] = [];
    const set = (column: string, value: unknown, cast = "") => {
      params.push(value);
      sets.push(`${column} = $${params.length}${cast}`);
    };
    if (patch.title !== undefined) set("title", patch.title);
    if (patch.parentId !== undefined) set("parent_id", patch.parentId, "::uuid");
    if (patch.body !== undefined) {
      set("body", patch.body === null ? null : JSON.stringify(patch.body), "::jsonb");
      set("body_text", patch.bodyText ?? "");
    }
    if (patch.props !== undefined) set("props", JSON.stringify(patch.props), "::jsonb");
    sets.push("rev = nextval('change_seq')", "updated_at = now()");

    const updated = await this.sql.query(
      `update pages set ${sets.join(", ")} where id = $1 and rev = $2 and deleted_at is null returning ${PAGE_COLUMNS}`,
      params,
    );
    if (updated[0]) return { status: "ok", page: toPage(updated[0]) };

    const current = await this.get(id);
    return current ? { status: "conflict", page: current } : { status: "not_found" };
  }

  async softDelete(id: string): Promise<boolean> {
    const rows = await this.sql.query(
      `with recursive doomed as (
         select id from pages where id = $1 and deleted_at is null
         union
         select p.id from pages p join doomed d on p.parent_id = d.id where p.deleted_at is null
       )
       update pages set deleted_at = now(), updated_at = now(), rev = nextval('change_seq')
       where id in (select id from doomed) returning id`,
      [id],
    );
    return rows.length > 0;
  }

  async isDescendant(ancestorId: string, candidateId: string): Promise<boolean> {
    const rows = await this.sql.query(
      `with recursive d as (
         select id from pages where parent_id = $1
         union
         select p.id from pages p join d on p.parent_id = d.id
       )
       select 1 as found from d where id = $2`,
      [ancestorId, candidateId],
    );
    return rows.length > 0;
  }

  async search(query: string, limit: number): Promise<SearchHit[]> {
    const rows = await this.sql.query(
      `select id, kind, title, left(body_text, 160) as snippet from pages
       where deleted_at is null and ${SEARCH_VECTOR} @@ plainto_tsquery('portuguese', $1)
       order by ts_rank(${SEARCH_VECTOR}, plainto_tsquery('portuguese', $1)) desc
       limit $2`,
      [query, limit],
    );
    return rows.map((row) => ({
      id: row.id as string,
      kind: row.kind as PageKind,
      title: row.title as string,
      snippet: row.snippet as string,
    }));
  }
}
