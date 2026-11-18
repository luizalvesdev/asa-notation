import { describe, expect, it } from "vitest";
import { DEFAULT_ROUTE, parseRoute, routeHash, routeTitle } from "../src/nav";

describe("nav", () => {
  it("lê a rota do hash", () => {
    expect(parseRoute("#/semana")).toBe("semana");
    expect(parseRoute("#/estudo/revisao")).toBe("estudo");
    expect(parseRoute("#semana")).toBe("semana");
  });

  it("cai em Hoje quando a rota é vazia ou desconhecida", () => {
    expect(parseRoute("")).toBe(DEFAULT_ROUTE);
    expect(parseRoute("#/nada")).toBe(DEFAULT_ROUTE);
  });

  it("monta hash e título", () => {
    expect(routeHash("inbox")).toBe("#/inbox");
    expect(routeTitle("rotina")).toBe("Rotina e check-ins");
  });
});
