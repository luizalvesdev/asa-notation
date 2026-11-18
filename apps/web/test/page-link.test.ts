import { describe, expect, it } from "vitest";
import { validImageUrl } from "../src/Editor";
import { filterPages, linkContent } from "../src/page-link";

const pages = [
  { id: "1", title: "Consenso com Raft", icon: "📚" },
  { id: "2", title: "Paxos", icon: null },
  { id: "3", title: "", icon: null },
  { id: "4", title: "Ração do gato", icon: null },
];

describe("filterPages", () => {
  it("sem termo lista tudo, até 8", () => {
    expect(filterPages(pages, "")).toHaveLength(4);
    expect(filterPages(Array.from({ length: 12 }, (_, i) => ({ id: String(i), title: `P${i}`, icon: null })), "")).toHaveLength(8);
  });
  it("ignora acento e caixa; quem começa com o termo vem primeiro", () => {
    expect(filterPages(pages, "racao").map((p) => p.pageId)).toEqual(["4"]);
    expect(filterPages(pages, "ra").map((p) => p.pageId)).toEqual(["4", "1"]);
  });
  it("página sem título aparece como Sem título", () => {
    expect(filterPages(pages, "sem")[0]).toMatchObject({ pageId: "3", pageTitle: "Sem título" });
  });
  it("mostra o ícone no menu", () => {
    expect(filterPages(pages, "consenso")[0]!.title).toBe("📚 Consenso com Raft");
  });
});

describe("linkContent", () => {
  it("texto com colchetes e link para a página", () => {
    expect(linkContent({ pageId: "abc", pageTitle: "Raft" })).toEqual({ type: "text", text: "[[Raft]]", marks: [{ type: "link", attrs: { href: "#/p/abc" } }] });
  });
});

describe("validImageUrl", () => {
  it("aceita http e https, recusa o resto", () => {
    expect(validImageUrl(" https://x.dev/a.png ")).toBe("https://x.dev/a.png");
    expect(validImageUrl("http://x.dev/a.png")).toBe("http://x.dev/a.png");
    expect(validImageUrl("javascript:alert(1)")).toBeNull();
    expect(validImageUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(validImageUrl("não é url")).toBeNull();
    expect(validImageUrl("")).toBeNull();
  });
});
