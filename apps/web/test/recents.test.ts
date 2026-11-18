import { describe, expect, it } from "vitest";
import { pushRecent } from "../src/recents";

describe("pushRecent", () => {
  it("põe no começo", () => {
    expect(pushRecent(["a", "b"], "c")).toEqual(["c", "a", "b"]);
  });
  it("não repete: quem já estava sobe", () => {
    expect(pushRecent(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
  });
  it("respeita o limite", () => {
    expect(pushRecent(["a", "b", "c"], "d", 3)).toEqual(["d", "a", "b"]);
  });
  it("lista vazia", () => {
    expect(pushRecent([], "x")).toEqual(["x"]);
  });
});
