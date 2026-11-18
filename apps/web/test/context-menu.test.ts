// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { keepsNativeMenu, menuFor, placeMenu } from "../src/context-menu";

const ids = (items: { id: string }[]) => items.map((i) => i.id);

describe("menuFor", () => {
  it("página: ações da página, com excluir por último e em destaque", () => {
    const items = menuFor({ kind: "page", id: "x", favorite: false });
    expect(ids(items)).toEqual(["open", "new-child", "favorite", "copy-link", "delete"]);
    expect(items.at(-1)).toMatchObject({ danger: true, separator: true });
    expect(items[2]!.label).toBe("Adicionar às favoritas");
  });
  it("página favorita oferece remover", () => {
    expect(menuFor({ kind: "page", id: "x", favorite: true })[2]!.label).toBe("Remover das favoritas");
  });
  it("link interno e externo", () => {
    expect(menuFor({ kind: "link", href: "#/p/1", internal: true })[0]!.label).toBe("Abrir");
    expect(menuFor({ kind: "link", href: "https://x.dev", internal: false })[0]!.label).toBe("Abrir em nova aba");
  });
  it("fora de tudo: atalhos do app; com texto selecionado, Copiar vem primeiro", () => {
    expect(ids(menuFor({ kind: "none", hasSelection: false }))).toEqual(["new-page", "capture", "search", "chat", "theme"]);
    const withSel = menuFor({ kind: "none", hasSelection: true });
    expect(ids(withSel)[0]).toBe("copy-text");
    expect(withSel[1]).toMatchObject({ id: "new-page", separator: true });
  });
  it("nunca oferece itens do navegador", () => {
    const all = [menuFor({ kind: "page", id: "x", favorite: false }), menuFor({ kind: "link", href: "#/a", internal: true }), menuFor({ kind: "none", hasSelection: true })].flat();
    expect(all.some((i) => /inspec|nova janela|incógnit|split|salvar/i.test(i.label))).toBe(false);
  });
});

describe("keepsNativeMenu", () => {
  it("campos de texto e editor ficam com o menu nativo", () => {
    document.body.innerHTML = '<input id="a"><textarea id="b"></textarea><div contenteditable="true"><p id="c">x</p></div><div id="d">y</div><a id="e" href="#/x">l</a>';
    expect(keepsNativeMenu(document.getElementById("a")!)).toBe(true);
    expect(keepsNativeMenu(document.getElementById("b")!)).toBe(true);
    expect(keepsNativeMenu(document.getElementById("c")!)).toBe(true);
    expect(keepsNativeMenu(document.getElementById("d")!)).toBe(false);
    expect(keepsNativeMenu(document.getElementById("e")!)).toBe(false);
  });
});

describe("placeMenu", () => {
  it("cabe: fica no ponto do clique", () => {
    expect(placeMenu(100, 100, 200, 150, 1000, 800)).toEqual({ left: 100, top: 100 });
  });
  it("passa da direita: abre para a esquerda do clique", () => {
    expect(placeMenu(900, 100, 200, 150, 1000, 800)).toEqual({ left: 700, top: 100 });
  });
  it("passa da base: sobe para caber", () => {
    expect(placeMenu(100, 700, 200, 150, 1000, 800)).toEqual({ left: 100, top: 642 });
  });
  it("janela minúscula não sai pela borda", () => {
    expect(placeMenu(5, 5, 400, 400, 300, 300)).toEqual({ left: 8, top: 8 });
  });
});
