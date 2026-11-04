import { randomUUID } from "node:crypto";
import type { ChangeFeed, Page, SearchHit, TreeNode } from "@asa/core";
import type { NewPage, PagePatch, PageStore, UpdateResult } from "./store.js";

export type PageInput = Omit<Page, "rev">;

export class InMemoryPageStore implements PageStore {
  private pages = new Map<string, Page>();
  private texts = new Map<string, string>();
  private seq = 0;

  constructor(private readonly now: () => Date = () => new Date()) {}

  save(input: PageInput): Page {
    const page: Page = { ...input, rev: ++this.seq };
    this.pages.set(page.id, page);
    return page;
  }

  async head(): Promise<number> {
    return this.seq;
  }

  async changes(since: number, limit: number): Promise<ChangeFeed> {
    const newer = [...this.pages.values()]
      .filter((p) => p.rev > since)
      .sort((a, b) => a.rev - b.rev);
    const pages = newer.slice(0, limit);
    const last = pages[pages.length - 1];
    return {
      pages,
      next: last ? last.rev : since,
      hasMore: newer.length > pages.length,
    };
  }

  async get(id: string): Promise<Page | null> {
    const page = this.pages.get(id);
    return page && page.deletedAt === null ? page : null;
  }

  async tree(): Promise<TreeNode[]> {
    return [...this.pages.values()]
      .filter((p) => p.deletedAt === null && p.databaseId === null)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(({ id, parentId, kind, title, rev, updatedAt }) => ({ id, parentId, kind, title, rev, updatedAt }));
  }

  async create(input: NewPage): Promise<Page> {
    const stamp = this.now().toISOString();
    const page = this.save({
      id: randomUUID(),
      parentId: input.parentId,
      databaseId: null,
      kind: input.kind,
      title: input.title,
      body: input.body,
      props: input.props,
      origin: "app",
      createdAt: stamp,
      updatedAt: stamp,
      deletedAt: null,
    });
    this.texts.set(page.id, input.bodyText);
    return page;
  }

  async update(id: string, patch: PagePatch, baseRev: number): Promise<UpdateResult> {
    const current = await this.get(id);
    if (!current) return { status: "not_found" };
    if (current.rev !== baseRev) return { status: "conflict", page: current };
    const next: Page = {
      ...current,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.parentId !== undefined ? { parentId: patch.parentId } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.props !== undefined ? { props: patch.props } : {}),
      updatedAt: this.now().toISOString(),
      rev: ++this.seq,
    };
    this.pages.set(id, next);
    if (patch.body !== undefined) this.texts.set(id, patch.bodyText ?? "");
    return { status: "ok", page: next };
  }

  async softDelete(id: string): Promise<boolean> {
    const root = await this.get(id);
    if (!root) return false;
    const stamp = this.now().toISOString();
    const doomed = [root.id, ...this.descendants(root.id)];
    for (const target of doomed) {
      const page = this.pages.get(target)!;
      if (page.deletedAt !== null) continue;
      this.pages.set(target, { ...page, deletedAt: stamp, updatedAt: stamp, rev: ++this.seq });
    }
    return true;
  }

  async isDescendant(ancestorId: string, candidateId: string): Promise<boolean> {
    return this.descendants(ancestorId).includes(candidateId);
  }

  async search(query: string, limit: number): Promise<SearchHit[]> {
    const needle = query.toLowerCase();
    return [...this.pages.values()]
      .filter((p) => p.deletedAt === null)
      .filter((p) => `${p.title} ${this.texts.get(p.id) ?? ""}`.toLowerCase().includes(needle))
      .slice(0, limit)
      .map((p) => ({ id: p.id, kind: p.kind, title: p.title, snippet: (this.texts.get(p.id) ?? "").slice(0, 160) }));
  }

  private descendants(id: string): string[] {
    const out: string[] = [];
    const queue = [id];
    while (queue.length > 0) {
      const parent = queue.shift()!;
      for (const page of this.pages.values()) {
        if (page.parentId === parent && !out.includes(page.id)) {
          out.push(page.id);
          queue.push(page.id);
        }
      }
    }
    return out;
  }
}
