import { describe, expect, it } from "vitest";
import { extractText } from "../src/text.js";

describe("extractText", () => {
  it("joins text nodes and separates blocks", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", content: [{ type: "text", text: "Título" }] },
        { type: "paragraph", content: [{ type: "text", text: "um " }, { type: "text", text: "dois" }] },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "item" }] }] }] },
      ],
    };
    expect(extractText(doc)).toBe("Título um dois item");
  });

  it("returns an empty string for null, junk and empty docs", () => {
    expect(extractText(null)).toBe("");
    expect(extractText("x")).toBe("");
    expect(extractText({ type: "doc" })).toBe("");
    expect(extractText({ type: "doc", content: [{ type: "paragraph" }] })).toBe("");
  });

  it("ignores malformed children without throwing", () => {
    expect(extractText({ type: "doc", content: [null, 3, { type: "paragraph", content: "oops" }] })).toBe("");
  });
});
