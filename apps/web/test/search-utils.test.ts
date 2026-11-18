import { describe, expect, it } from "vitest";
import { formatDeleted, splitSnippet } from "../src/search-utils";

describe("splitSnippet", () => {
  it("separa o termo marcado do resto", () => {
    expect(splitSnippet("antes \u0001cache\u0002 depois")).toEqual([
      { text: "antes ", hit: false },
      { text: "cache", hit: true },
      { text: " depois", hit: false },
    ]);
  });

  it("aceita vários termos e trechos sem marca", () => {
    expect(splitSnippet("\u0001a\u0002 b \u0001c\u0002")).toEqual([
      { text: "a", hit: true },
      { text: " b ", hit: false },
      { text: "c", hit: true },
    ]);
    expect(splitSnippet("sem marca")).toEqual([{ text: "sem marca", hit: false }]);
    expect(splitSnippet("")).toEqual([]);
  });

  it("trata HTML como texto comum", () => {
    expect(splitSnippet("<img src=x onerror=1> \u0001x\u0002")).toEqual([
      { text: "<img src=x onerror=1> ", hit: false },
      { text: "x", hit: true },
    ]);
  });
});

describe("formatDeleted", () => {
  const now = new Date(2026, 10, 18, 15, 0).getTime();

  it("hoje e ontem mostram o horário", () => {
    expect(formatDeleted(new Date(2026, 10, 18, 9, 5).toISOString(), now)).toBe("hoje, 09:05");
    expect(formatDeleted(new Date(2026, 10, 17, 23, 59).toISOString(), now)).toBe("ontem, 23:59");
  });

  it("datas antigas mostram dia e mês, e o ano quando muda", () => {
    expect(formatDeleted(new Date(2026, 10, 3, 12, 0).toISOString(), now)).toMatch(/^3 nov/);
    expect(formatDeleted(new Date(2025, 11, 25, 12, 0).toISOString(), now)).toMatch(/2025/);
  });

  it("devolve vazio para data inválida", () => {
    expect(formatDeleted("nada", now)).toBe("");
  });
});
