import { describe, expect, it } from "vitest";
import { DEFAULT_ROUTE, GO_KEYS, GO_WINDOW_MS, goKey, goStep, navParent, pageHash, publicHash, parseRoute, routeHash, routeTitle, settingsHash } from "../src/nav";

const ID = "462b29f6-0058-4e35-835b-ac4493d059e7";

describe("nav", () => {
  it("lê a tela do hash", () => {
    expect(parseRoute("#/semana")).toEqual({ kind: "tela", id: "semana" });
    expect(parseRoute("#/estudo/revisao")).toEqual({ kind: "tela", id: "revisao" });
    expect(parseRoute("#/estudo/estatisticas")).toEqual({ kind: "tela", id: "estudo-stats" });
    expect(parseRoute("#/configuracoes/importar")).toEqual({ kind: "tela", id: "importar" });
    expect(navParent("importar")).toBe("configuracoes");
    expect(parseRoute("#/rotina/sabado")).toEqual({ kind: "tela", id: "rotina", sub: "sabado" });
    expect(parseRoute("#/rotina/quinta")).toEqual({ kind: "tela", id: "rotina", sub: "quinta" });
    expect(parseRoute("#/rotina/x")).toEqual({ kind: "tela", id: "rotina" });
    expect(parseRoute("#/configuracoes/rotina")).toEqual({ kind: "tela", id: "configuracoes", sub: "rotina" });
    expect(parseRoute("#/configuracoes/assistentes")).toEqual({ kind: "tela", id: "configuracoes", sub: "assistentes" });
    expect(parseRoute("#/configuracoes/x")).toEqual({ kind: "tela", id: "configuracoes" });
    expect(settingsHash("dados")).toBe("#/configuracoes/dados");
    expect(parseRoute("#/estudo/outra")).toEqual({ kind: "tela", id: "estudo" });
    expect(parseRoute("#semana")).toEqual({ kind: "tela", id: "semana" });
  });

  it("lê a página do hash", () => {
    expect(parseRoute(`#/p/${ID}`)).toEqual({ kind: "pagina", pageId: ID });
    expect(parseRoute(pageHash(ID.toUpperCase()))).toEqual({ kind: "pagina", pageId: ID });
  });

  it("lê o link público do hash", () => {
    expect(parseRoute("#/s/k3x9Ab_-Qz12")).toEqual({ kind: "publica", slug: "k3x9Ab_-Qz12" });
    expect(parseRoute(publicHash("abcdefgh12"))).toEqual({ kind: "publica", slug: "abcdefgh12" });
    expect(parseRoute("#/s/curto")).toEqual({ kind: "tela", id: DEFAULT_ROUTE });
    expect(parseRoute("#/s/com espaço!!")).toEqual({ kind: "tela", id: DEFAULT_ROUTE });
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

describe("atalhos G + letra", () => {
  it("G e a letra dentro do prazo levam à tela", () => {
    let s = goStep(null, "g", 1000);
    expect(s).toEqual({ armedAt: 1000, target: null });
    s = goStep(s.armedAt, "H", 1500);
    expect(s).toEqual({ armedAt: null, target: "hoje" });
  });

  it("fora do prazo, letra desconhecida ou sem G não fazem nada", () => {
    expect(goStep(1000, "h", 1000 + GO_WINDOW_MS + 1).target).toBeNull();
    expect(goStep(1000, "x", 1100)).toEqual({ armedAt: null, target: null });
    expect(goStep(null, "h", 1000).target).toBeNull();
    expect(goStep(1000, "g", 1100)).toEqual({ armedAt: 1100, target: null });
  });

  it("cada tela tem uma letra só e todas são rotas válidas", () => {
    const targets = Object.values(GO_KEYS);
    expect(new Set(targets).size).toBe(targets.length);
    for (const [key, id] of Object.entries(GO_KEYS)) {
      expect(goKey(id)).toBe(key);
      expect(parseRoute(routeHash(id))).toEqual({ kind: "tela", id });
    }
    expect(goKey("busca")).toBeNull();
  });
});
