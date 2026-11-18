import { describe, expect, it } from "vitest";
import { standaloneSvg, svgSize } from "../src/svg-export";

describe("svgSize", () => {
  it("lê o viewBox", () => {
    expect(svgSize('<svg id="a" viewBox="0 0 320.5 140" style="max-width: 320px">')).toEqual({ width: 320.5, height: 140 });
    expect(svgSize('<svg viewBox="-8,-8,100,50">')).toEqual({ width: 100, height: 50 });
  });
  it("cai para width e height", () => {
    expect(svgSize('<svg width="200px" height="80">')).toEqual({ width: 200, height: 80 });
  });
  it("devolve null sem medidas", () => {
    expect(svgSize("<svg>")).toBeNull();
  });
});

describe("standaloneSvg", () => {
  it("acrescenta o xmlns e o tamanho quando faltam", () => {
    const out = standaloneSvg('<svg viewBox="0 0 10 20"><g/></svg>');
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out).toContain('width="10" height="20"');
    expect(out.startsWith("<?xml")).toBe(true);
  });
  it("não duplica o que já existe", () => {
    const out = standaloneSvg('<svg xmlns="http://www.w3.org/2000/svg" width="5" height="5" viewBox="0 0 5 5"></svg>');
    expect(out.match(/xmlns=/g)).toHaveLength(1);
    expect(out.match(/width=/g)).toHaveLength(1);
  });
});
