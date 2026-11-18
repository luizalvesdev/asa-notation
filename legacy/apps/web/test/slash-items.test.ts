import { describe, expect, it } from "vitest";
import { filterSlashItems, SLASH_ITEMS } from "../src/slash-items.js";

const ids = (query: string) => filterSlashItems(query).map((item) => item.id);

describe("filterSlashItems", () => {
  it("returns every block for an empty query", () => {
    expect(filterSlashItems("")).toEqual(SLASH_ITEMS);
    expect(filterSlashItems("   ")).toEqual(SLASH_ITEMS);
  });

  it("ignores accents and case", () => {
    expect(ids("TITULO")).toEqual(["h1", "h2", "h3"]);
    expect(ids("citação")).toEqual(["quote"]);
    expect(ids("codigo")).toEqual(["code"]);
  });

  it("matches keywords as well as titles", () => {
    expect(ids("h2")).toEqual(["h2"]);
    expect(ids("todo")).toEqual(["task"]);
    expect(ids("hr")).toEqual(["divider"]);
  });

  it("puts titles that start with the query before other matches", () => {
    expect(ids("lista")).toEqual(["bullet", "ordered", "task"]);
    expect(ids("nume")[0]).toBe("ordered");
  });

  it("returns nothing when no block matches", () => {
    expect(ids("zzzz")).toEqual([]);
  });

  it("gives every item a unique id and a runnable command", () => {
    expect(new Set(SLASH_ITEMS.map((i) => i.id)).size).toBe(SLASH_ITEMS.length);
    for (const item of SLASH_ITEMS) expect(typeof item.run).toBe("function");
  });
});
