import { useCallback, useEffect, useState } from "react";
import { pagesApi } from "./api";
import { subtreeIds } from "./pages-tree";
import { toTreeNode, type Page, type TreeNode } from "./pages-types";

export type TreeStatus = "carregando" | "pronto" | "erro";

export interface PagesApi {
  nodes: TreeNode[];
  status: TreeStatus;
  reload: () => void;
  /** Cria uma página (no fim das irmãs) e a coloca na árvore. */
  create: (parentId: string | null, title?: string) => Promise<Page>;
  /** Reflete na árvore uma página salva em outro lugar (título, ícone, favorito). */
  applySaved: (page: Page) => void;
  /** Move a subárvore para a lixeira e a tira da árvore. Devolve quantas páginas foram. */
  remove: (id: string) => Promise<number>;
  /** Desfaz a exclusão e recarrega a árvore. */
  restore: (id: string) => Promise<void>;
}

export function usePages(): PagesApi {
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [status, setStatus] = useState<TreeStatus>("carregando");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    pagesApi
      .tree()
      .then((list) => {
        if (!live) return;
        setNodes(list);
        setStatus("pronto");
      })
      .catch(() => {
        if (live) setStatus("erro");
      });
    return () => {
      live = false;
    };
  }, [version]);

  const reload = useCallback(() => {
    setStatus("carregando");
    setVersion((v) => v + 1);
  }, []);

  const create = useCallback(async (parentId: string | null, title?: string) => {
    const page = await pagesApi.create(title ? { parentId, title } : { parentId });
    setNodes((current) => [...current, toTreeNode(page)]);
    return page;
  }, []);

  const applySaved = useCallback((page: Page) => {
    setNodes((current) => current.map((n) => (n.id === page.id ? toTreeNode(page) : n)));
  }, []);

  const remove = useCallback(
    async (id: string) => {
      const { deleted } = await pagesApi.remove(id);
      setNodes((current) => {
        const gone = subtreeIds(current, id);
        return current.filter((n) => !gone.has(n.id));
      });
      return deleted;
    },
    [],
  );

  const restore = useCallback(async (id: string) => {
    await pagesApi.restore(id);
    setStatus("carregando");
    setVersion((v) => v + 1);
  }, []);

  return { nodes, status, reload, create, applySaved, remove, restore };
}
