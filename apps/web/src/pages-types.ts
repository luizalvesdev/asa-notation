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
