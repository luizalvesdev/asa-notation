import type { ChangeFeed } from "@asa/core";

export interface PageStore {
  head(): Promise<number>;
  changes(since: number, limit: number): Promise<ChangeFeed>;
}
