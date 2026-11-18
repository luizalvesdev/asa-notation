export interface Page {
  id: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  favorite: boolean;
  position: string;
  body: unknown | null;
  /** `page` comum, `database` (tem esquema), `row` (linha de uma database) ou `canvas` (quadro livre). */
  kind: PageKind;
  /** Degradê (`grad:ocean`) ou endereço de imagem. */
  cover: string | null;
  /** Valores das propriedades, só em linhas. */
  props: Record<string, unknown>;
  /** Propriedades e views, só em databases. */
  schema: unknown | null;
  rev: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type PageKind = "page" | "database" | "row" | "canvas";

export interface TreeNode {
  id: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  favorite: boolean;
  position: string;
  kind: PageKind;
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
  cover?: string | null;
  /** Junta com os valores atuais; `null` apaga um valor. */
  props?: Record<string, unknown>;
  schema?: unknown;
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
  kind?: PageKind;
  cover?: string | null;
  props?: Record<string, unknown>;
  schema?: unknown;
}

export interface RowItem {
  id: string;
  title: string;
  icon: string | null;
  props: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
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
  | { kind: "anchor_invalid" }
  | { kind: "row_locked" };

export interface MoveTarget {
  parentId: string | null;
  before?: string;
  after?: string;
}

export interface VersionItem {
  id: number;
  title: string;
  createdAt: string;
  excerpt: string;
}

export interface VersionFull {
  id: number;
  title: string;
  body: unknown;
  createdAt: string;
}

/** O que um leitor de link público enxerga: sem ids, sem pai, sem subpáginas. */
export interface PublicPage {
  title: string;
  icon: string | null;
  cover: string | null;
  kind: PageKind;
  body: unknown | null;
  updatedAt: string;
}
