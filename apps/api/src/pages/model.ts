export interface Page {
  id: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  favorite: boolean;
  position: string;
  body: unknown | null;
  rev: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TreeNode {
  id: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  favorite: boolean;
  position: string;
}

export interface TrashItem {
  id: string;
  title: string;
  icon: string | null;
  deletedAt: string;
  parentTitle: string | null;
}

export interface PageRef {
  id: string;
  title: string;
  icon: string | null;
}

export interface SearchHit extends PageRef {
  /** Onde o termo apareceu. */
  matchIn: "title" | "content";
  /** Trecho do corpo. O termo vem entre U+0001 (início) e U+0002 (fim), nunca como HTML. */
  snippet: string;
}

export interface PagePatch {
  title?: string;
  icon?: string | null;
  favorite?: boolean;
  body?: unknown;
}

export interface NewPage {
  parentId: string | null;
  title: string;
  icon: string | null;
  body: unknown | null;
}

export type UpdateResult =
  | { kind: "ok"; page: Page }
  | { kind: "not_found" }
  | { kind: "conflict"; page: Page };

export type MoveResult =
  | { kind: "ok"; page: Page }
  | { kind: "not_found" }
  | { kind: "parent_not_found" }
  | { kind: "cycle" }
  | { kind: "anchor_invalid" };

export interface MoveTarget {
  parentId: string | null;
  before?: string;
  after?: string;
}
