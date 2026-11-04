import type { ChangeFeed, Page } from "@asa/core";
import type { PageStore } from "./store.js";

export type PageInput = Omit<Page, "rev">;

export class InMemoryPageStore implements PageStore {
  private pages = new Map<string, Page>();
  private seq = 0;

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
}
