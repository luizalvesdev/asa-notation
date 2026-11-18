import { describe, expect, it } from "vitest";
import { DEFAULT_ROUTE, navParent, pageHash, parseRoute, routeHash, routeTitle } from "../src/nav";

const ID = "462b29f6-0058-4e35-835b-ac4493d059e7";

describe("nav", () => {
  it("lê a tela do hash", () => {
    expect(parseRoute("#/semana")).toEqual({ kind: "tela", id: "semana" });
    expect(parseRoute("#/estudo/revisao")).toEqual({ kind: "tela", id: "revisao" });
    expect(parseRoute("#/estudo/estatisticas")).toEqual({ kind: "tela", id: "estudo-stats" });
    expect(parseRoute("#/rotina/sabado")).toEqual({ kind: "tela", id: "rotina", sub: "sabado" });
    expect(parseRoute("#/rotina/quinta")).toEqual({ kind: "tela", id: "rotina", sub: "quinta" });
    expect(parseRoute("#/rotina/x")).toEqual({ kind: "tela", id: "rotina" });
    expect(parseRoute("#/estudo/outra")).toEqual({ kind: "tela", id: "estudo" });
    expect(parseRoute("#semana")).toEqual({ kind: "tela", id: "semana" });
  });

  it("lê a página do hash", () => {
    expect(parseRoute(`#/p/${ID}`)).toEqual({ kind: "pagina", pageId: ID });
    expect(parseRoute(pageHash(ID.toUpperCase()))).toEqual({ kind: "pagina", pageId: ID });
  });

  it("cai em Hoje quando a rota é vazia, desconhecida ou o id da página é inválido", () => {
    expect(parseRoute("")).toEqual({ kind: "tela", id: DEFAULT_ROUTE });
    expect(parseRoute("#/nada")).toEqual({ kind: "tela", id: DEFAULT_ROUTE });
    expect(parseRoute("#/p/abc")).toEqual({ kind: "tela", id: DEFAULT_ROUTE });
    expect(parseRoute("#/p")).toEqual({ kind: "tela", id: DEFAULT_ROUTE });
  });

  it("monta hash e título", () => {
    expect(routeHash("inbox")).toBe("#/inbox");
    expect(pageHash(ID)).toBe(`#/p/${ID}`);
    expect(routeTitle("rotina")).toBe("Rotina e check-ins");
    expect(routeHash("revisao")).toBe("#/estudo/revisao");
    expect(routeHash("estudo-stats")).toBe("#/estudo/estatisticas");
    expect(routeTitle("revisao")).toBe("Revisão");
    expect(navParent("revisao")).toBe("estudo");
    expect(navParent("hoje")).toBe("hoje");
  });
});
