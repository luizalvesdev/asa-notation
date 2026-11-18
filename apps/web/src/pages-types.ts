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

export interface PagePatch {
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
