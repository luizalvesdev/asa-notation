import type { ChangeFeed, DatabaseRow, Page, PageKind, SearchHit, TreeNode } from "@asa/core";

export interface NewPage {
  parentId: string | null;
  databaseId: string | null;
  kind: PageKind;
  title: string;
  body: unknown | null;
  bodyText: string;
  props: Record<string, unknown>;
  sortKey: string | null;
}

export interface PagePatch {
  title?: string;
  parentId?: string | null;
  body?: unknown | null;
  bodyText?: string;
  props?: Record<string, unknown>;
  sortKey?: string | null;
}

export type UpdateResult =
  | { status: "ok"; page: Page }
  | { status: "conflict"; page: Page }
  | { status: "not_found" };

export interface PageStore {
  head(): Promise<number>;
  changes(since: number, limit: number): Promise<ChangeFeed>;
  get(id: string): Promise<Page | null>;
  tree(): Promise<TreeNode[]>;
  rows(databaseId: string): Promise<DatabaseRow[]>;
  create(input: NewPage): Promise<Page>;
  update(id: string, patch: PagePatch, baseRev: number): Promise<UpdateResult>;
  softDelete(id: string): Promise<boolean>;
  isDescendant(ancestorId: string, candidateId: string): Promise<boolean>;
  search(query: string, limit: number): Promise<SearchHit[]>;
}
