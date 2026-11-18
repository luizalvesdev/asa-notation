import { describe, expect, it } from "vitest";
import { SLASH_ITEMS, filterSlashItems } from "../src/slash-items";

const titles = (query: string) => filterSlashItems(query).map((item) => item.title);

describe("filterSlashItems", () => {
  it("sem termo devolve todos, na ordem", () => {
    expect(filterSlashItems("")).toEqual(SLASH_ITEMS);
    expect(filterSlashItems("   ")).toEqual(SLASH_ITEMS);
  });

  it("casa por título e por palavra-chave", () => {
    expect(titles("cod")).toEqual(["Bloco de código"]);
    expect(titles("checkbox")).toEqual(["Lista de tarefas"]);
    expect(titles("hr")).toEqual(["Divisor"]);
  });

  it("ignora acento e caixa", () => {
    expect(titles("CITACAO")).toEqual(["Citação"]);
    expect(titles("título")).toEqual(["Título 1", "Título 2", "Título 3"]);
  });

  it("coloca quem começa com o termo antes dos demais", () => {
    const result = titles("lista");
    expect(result.slice(0, 3)).toEqual(["Lista", "Lista numerada", "Lista de tarefas"]);
  });

  it("devolve vazio quando nada casa", () => {
    expect(titles("zzzz")).toEqual([]);
  });

  it("todo item tem id único e atalho de grupo válido", () => {
    expect(new Set(SLASH_ITEMS.map((i) => i.id)).size).toBe(SLASH_ITEMS.length);
    expect(new Set(SLASH_ITEMS.map((i) => i.group))).toEqual(new Set(["Básico", "Listas", "Blocos", "Mídia"]));
  });
});
