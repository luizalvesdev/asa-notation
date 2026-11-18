import { describe, expect, it } from "vitest";
import { normalizeHref } from "../src/format-menu";

describe("normalizeHref", () => {
  it("completa endereços sem protocolo", () => {
    expect(normalizeHref("site.com")).toBe("https://site.com");
    expect(normalizeHref(" github.com/itspaulin ")).toBe("https://github.com/itspaulin");
  });
  it("aceita http, https, mailto e link interno", () => {
    expect(normalizeHref("http://x.dev")).toBe("http://x.dev");
    expect(normalizeHref("mailto:a@b.dev")).toBe("mailto:a@b.dev");
    expect(normalizeHref("#/p/abc")).toBe("#/p/abc");
  });
  it("recusa o que não é seguro ou não parece endereço", () => {
    expect(normalizeHref("javascript:alert(1)")).toBeNull();
    expect(normalizeHref("data:text/html,x")).toBeNull();
    expect(normalizeHref("duas palavras")).toBeNull();
    expect(normalizeHref("semponto")).toBeNull();
    expect(normalizeHref("")).toBeNull();
  });
});
