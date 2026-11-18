import { describe, expect, it } from "vitest";
import { validIcon } from "../src/IconPicker";

describe("validIcon", () => {
  it("aceita emoji simples, com variação e composto", () => {
    expect(validIcon("📚")).toBe(true);
    expect(validIcon("🗓️")).toBe(true);
    expect(validIcon("👨‍👩‍👧")).toBe(true);
    expect(validIcon("🇧🇷")).toBe(true);
  });
  it("recusa vazio, texto longo e muitos emojis", () => {
    expect(validIcon("")).toBe(false);
    expect(validIcon("   ")).toBe(false);
    expect(validIcon("abc")).toBe(false);
    expect(validIcon("📚📖📝")).toBe(false);
  });
});
