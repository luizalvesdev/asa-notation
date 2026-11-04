import type { ChangeFeed, Page, PageKind, PageOrigin } from "@asa/core";
import type { Row, SqlClient } from "./sql.js";
import type { PageStore } from "./store.js";

const PAGE_COLUMNS =
  "id, parent_id, database_id, kind, title, body, props, origin, rev, created_at, updated_at, deleted_at";

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
}
