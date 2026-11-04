export type PageKind = "page" | "database";

export type PageOrigin = "app" | "hermes" | "renato" | "obsidian";

export interface Page {
  id: string;
  parentId: string | null;
  databaseId: string | null;
  kind: PageKind;
  title: string;
  body: unknown | null;
  props: Record<string, unknown>;
  origin: PageOrigin;
  rev: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ChangeFeed {
  pages: Page[];
  next: number;
  hasMore: boolean;
}

export interface TreeNode {
  id: string;
  parentId: string | null;
  kind: PageKind;
  title: string;
  rev: number;
  updatedAt: string;
}

export interface SearchHit {
  id: string;
  kind: PageKind;
  title: string;
  snippet: string;
}
