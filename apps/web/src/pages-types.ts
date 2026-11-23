export interface Page {
  id: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  favorite: boolean;
  position: string;
  body: unknown | null;
  kind: PageKind;
  cover: string | null;
  props: Record<string, unknown>;
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
  /** Contêiner de uma seção da barra lateral ("career" = Minha Carreira); null nas demais. */
  section: string | null;
}

export interface PagePatch {
  cover?: string | null;
  props?: Record<string, unknown>;
  schema?: unknown;
  title?: string;
  icon?: string | null;
  favorite?: boolean;
  body?: unknown;
}

export function toTreeNode(page: Page): TreeNode {
  return {
    id: page.id,
    parentId: page.parentId,
    title: page.title,
    icon: page.icon,
    favorite: page.favorite,
    position: page.position,
    kind: page.kind,
    section: typeof page.props?.section === "string" ? page.props.section : null,
  };
}

export interface TrashItem {
  id: string;
  title: string;
  icon: string | null;
  deletedAt: string;
  parentTitle: string | null;
}

export interface SearchHit {
  id: string;
  title: string;
  icon: string | null;
  matchIn: "title" | "content";
  /** Trecho do corpo. O termo vem entre U+0001 (início) e U+0002 (fim). */
  snippet: string;
}
