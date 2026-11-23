import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, doc, type TestApp } from "./helpers.js";

let app: TestApp;
let cookies: Record<string, string>;

beforeEach(async () => {
  app = await createTestApp();
  cookies = await app.owner();
});

interface PageJson {
  id: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  favorite: boolean;
  position: string;
  body: unknown;
  rev: number;
  deletedAt: string | null;
}

async function create(body: Record<string, unknown> = {}): Promise<PageJson> {
  const res = await app.call("POST", "/pages", { cookies, body });
  expect(res.status).toBe(201);
  return (res.body as { page: PageJson }).page;
}

/** Títulos na árvore, ordenados: a ordem entre níveis diferentes não importa, só entre irmãos. */
async function treeTitles(): Promise<string[]> {
  const res = await app.call("GET", "/pages/tree", { cookies });
  return (res.body as { pages: PageJson[] }).pages.map((p) => p.title).sort();
}

async function childrenOf(parentId: string | null): Promise<string[]> {
  const res = await app.call("GET", "/pages/tree", { cookies });
  return (res.body as { pages: PageJson[] }).pages.filter((p) => p.parentId === parentId).map((p) => p.title);
}

describe("criar e ler", () => {
  it("cria com padrões e devolve a página", async () => {
    const page = await create();
    expect(page).toMatchObject({ parentId: null, title: "", icon: null, favorite: false, body: null, deletedAt: null });
    expect(page.rev).toBeGreaterThan(0);
    const got = await app.call("GET", `/pages/${page.id}`, { cookies });
    expect((got.body as { page: PageJson }).page.id).toBe(page.id);
  });

  it("guarda título, ícone e corpo", async () => {
    const page = await create({ title: "Raft", icon: "📘", body: doc("Consenso") });
    expect(page).toMatchObject({ title: "Raft", icon: "📘", body: doc("Consenso") });
  });

  it("cria filhas e as lista na ordem de criação entre irmãs", async () => {
    const parent = await create({ title: "Estudo" });
    await create({ title: "A", parentId: parent.id });
    await create({ title: "B", parentId: parent.id });
    await create({ title: "C", parentId: parent.id });
    expect(await childrenOf(parent.id)).toEqual(["A", "B", "C"]);
  });

  it("valida os campos", async () => {
    const bad = async (body: unknown) => (await app.call("POST", "/pages", { cookies, body })).status;
    expect(await bad({ title: 5 })).toBe(400);
    expect(await bad({ title: "x".repeat(501) })).toBe(400);
    expect(await bad({ icon: "" })).toBe(400);
    expect(await bad({ icon: "x".repeat(17) })).toBe(400);
    expect(await bad({ parentId: "nao-e-uuid" })).toBe(400);
    expect(await bad({ body: { type: "paragraph" } })).toBe(400);
    expect(await bad({ body: "texto" })).toBe(400);
  });

  it("404 para pai inexistente ou na lixeira", async () => {
    const missing = await app.call("POST", "/pages", { cookies, body: { parentId: "11111111-1111-4111-8111-111111111111" } });
    expect(missing.status).toBe(404);
    const parent = await create({ title: "P" });
    await app.call("DELETE", `/pages/${parent.id}`, { cookies });
    const trashed = await app.call("POST", "/pages", { cookies, body: { parentId: parent.id } });
    expect(trashed.status).toBe(404);
  });

  it("404 para id desconhecido e rota inexistente para id malformado", async () => {
    expect((await app.call("GET", "/pages/11111111-1111-4111-8111-111111111111", { cookies })).status).toBe(404);
    expect((await app.call("GET", "/pages/abc", { cookies })).status).toBe(404);
  });
});

describe("seções da barra lateral", () => {
  it("cria uma seção nova: página raiz marcada custom, com o nome aparado", async () => {
    const res = await app.call("POST", "/pages/sections", { cookies, body: { title: "  Freela  " } });
    expect(res.status).toBe(201);
    const page = (res.body as { page: PageJson }).page;
    expect(page).toMatchObject({ title: "Freela", parentId: null });
    const tree = (await app.call("GET", "/pages/tree", { cookies })).body as { pages: (PageJson & { section: string | null })[] };
    expect(tree.pages.find((p) => p.id === page.id)!.section).toBe("custom");
    // Duas seções com o mesmo nome são seções diferentes.
    const again = await app.call("POST", "/pages/sections", { cookies, body: { title: "Freela" } });
    expect((again.body as { page: PageJson }).page.id).not.toBe(page.id);
  });

  it("recusa nome vazio ou longo demais", async () => {
    for (const title of ["", "   ", "x".repeat(81), 3]) {
      expect((await app.call("POST", "/pages/sections", { cookies, body: { title } })).status).toBe(400);
    }
  });
});

describe("editar", () => {
  it("altera só os campos enviados e avança o rev", async () => {
    const page = await create({ title: "Antes", icon: "📘" });
    const res = await app.call("PATCH", `/pages/${page.id}`, { cookies, body: { title: "Depois" } });
    const updated = (res.body as { page: PageJson }).page;
    expect(updated).toMatchObject({ title: "Depois", icon: "📘" });
    expect(updated.rev).toBeGreaterThan(page.rev);
  });

  it("limpa o ícone com null e marca favorito", async () => {
    const page = await create({ icon: "📘" });
    const res = await app.call("PATCH", `/pages/${page.id}`, { cookies, body: { icon: null, favorite: true } });
    expect((res.body as { page: PageJson }).page).toMatchObject({ icon: null, favorite: true });
  });

  it("recusa patch vazio e valores inválidos", async () => {
    const page = await create();
    const patch = async (body: unknown) => (await app.call("PATCH", `/pages/${page.id}`, { cookies, body })).status;
    expect(await patch({})).toBe(400);
    expect(await patch({ title: 1 })).toBe(400);
    expect(await patch({ favorite: "sim" })).toBe(400);
    expect(await patch({ body: { type: "x" } })).toBe(400);
    expect(await patch({ title: "ok", baseRev: -1 })).toBe(400);
  });

  it("detecta conflito quando o baseRev ficou para trás", async () => {
    const page = await create({ title: "v1" });
    await app.call("PATCH", `/pages/${page.id}`, { cookies, body: { title: "v2" } });
    const stale = await app.call("PATCH", `/pages/${page.id}`, { cookies, body: { title: "v3", baseRev: page.rev } });
    expect(stale.status).toBe(409);
    expect((stale.body as { page: PageJson }).page.title).toBe("v2");
    const current = (stale.body as { page: PageJson }).page;
    const ok = await app.call("PATCH", `/pages/${page.id}`, { cookies, body: { title: "v3", baseRev: current.rev } });
    expect(ok.status).toBe(200);
  });

  it("404 ao editar página inexistente ou apagada", async () => {
    const page = await create();
    await app.call("DELETE", `/pages/${page.id}`, { cookies });
    expect((await app.call("PATCH", `/pages/${page.id}`, { cookies, body: { title: "x" } })).status).toBe(404);
  });
});

describe("mover e ordenar", () => {
  it("muda de pai e vai para o fim", async () => {
    const a = await create({ title: "A" });
    const b = await create({ title: "B" });
    await create({ title: "filha", parentId: b.id });
    const res = await app.call("POST", `/pages/${a.id}/move`, { cookies, body: { parentId: b.id } });
    expect(res.status).toBe(200);
    expect(await childrenOf(b.id)).toEqual(["filha", "A"]);
    expect(await childrenOf(null)).toEqual(["B"]);
  });

  it("reordena antes e depois de uma irmã", async () => {
    const [a, b, c] = [await create({ title: "A" }), await create({ title: "B" }), await create({ title: "C" })];
    await app.call("POST", `/pages/${c.id}/move`, { cookies, body: { parentId: null, before: a!.id } });
    expect(await childrenOf(null)).toEqual(["C", "A", "B"]);
    await app.call("POST", `/pages/${c.id}/move`, { cookies, body: { parentId: null, after: a!.id } });
    expect(await childrenOf(null)).toEqual(["A", "C", "B"]);
    await app.call("POST", `/pages/${a!.id}/move`, { cookies, body: { parentId: null, after: b!.id } });
    expect(await childrenOf(null)).toEqual(["C", "B", "A"]);
  });

  it("aguenta muitas inserções no mesmo ponto", async () => {
    const first = await create({ title: "0" });
    const last = await create({ title: "z" });
    const created: string[] = [];
    for (let i = 0; i < 12; i++) {
      const page = await create({ title: String(i + 1) });
      await app.call("POST", `/pages/${page.id}/move`, { cookies, body: { parentId: null, after: first.id } });
      created.unshift(page.title);
    }
    expect(await childrenOf(null)).toEqual(["0", ...created, "z"]);
    expect(last.title).toBe("z");
  });

  it("impede ciclos", async () => {
    const a = await create({ title: "A" });
    const b = await create({ title: "B", parentId: a.id });
    const c = await create({ title: "C", parentId: b.id });
    expect((await app.call("POST", `/pages/${a.id}/move`, { cookies, body: { parentId: c.id } })).status).toBe(409);
    expect((await app.call("POST", `/pages/${a.id}/move`, { cookies, body: { parentId: a.id } })).status).toBe(409);
    expect(await childrenOf(null)).toEqual(["A"]);
  });

  it("valida pai, âncora e existência", async () => {
    const a = await create({ title: "A" });
    const b = await create({ title: "B", parentId: a.id });
    const move = async (id: string, body: unknown) => (await app.call("POST", `/pages/${id}/move`, { cookies, body })).status;
    expect(await move(a.id, {})).toBe(400);
    expect(await move(a.id, { parentId: "x" })).toBe(400);
    expect(await move(a.id, { parentId: null, before: "x" })).toBe(400);
    expect(await move(a.id, { parentId: null, before: b.id, after: b.id })).toBe(400);
    // âncora que não é irmã no destino
    expect(await move(a.id, { parentId: null, after: b.id })).toBe(400);
    expect(await move(a.id, { parentId: "11111111-1111-4111-8111-111111111111" })).toBe(404);
    expect(await move("11111111-1111-4111-8111-111111111111", { parentId: null })).toBe(404);
  });
});

describe("lixeira", () => {
  it("apaga a subárvore, tira da árvore e lista só a raiz na lixeira", async () => {
    const root = await create({ title: "Raiz" });
    const kid = await create({ title: "Filha", parentId: root.id });
    await create({ title: "Neta", parentId: kid.id });
    await create({ title: "Outra" });

    const del = await app.call("DELETE", `/pages/${root.id}`, { cookies });
    expect(del.body).toEqual({ deleted: 3 });
    expect(await treeTitles()).toEqual(["Outra"]);
    expect((await app.call("GET", `/pages/${kid.id}`, { cookies })).status).toBe(404);

    const trash = (await app.call("GET", "/pages/trash", { cookies })).body as { items: { title: string; parentTitle: string | null }[] };
    expect(trash.items.map((i) => i.title)).toEqual(["Raiz"]);
  });

  it("apagar de novo dá 404", async () => {
    const page = await create();
    await app.call("DELETE", `/pages/${page.id}`, { cookies });
    expect((await app.call("DELETE", `/pages/${page.id}`, { cookies })).status).toBe(404);
  });

  it("restaura a subárvore inteira no mesmo lugar", async () => {
    const root = await create({ title: "Raiz" });
    const kid = await create({ title: "Filha", parentId: root.id });
    await create({ title: "Neta", parentId: kid.id });
    await app.call("DELETE", `/pages/${root.id}`, { cookies });

    const res = await app.call("POST", `/pages/${root.id}/restore`, { cookies });
    expect(res.status).toBe(200);
    expect((res.body as { page: PageJson }).page.deletedAt).toBeNull();
    expect(await treeTitles()).toEqual(["Filha", "Neta", "Raiz"]);
    expect((await app.call("GET", "/pages/trash", { cookies })).body).toEqual({ items: [] });
  });

  it("não restaura o que foi apagado separadamente antes", async () => {
    const root = await create({ title: "Raiz" });
    const old = await create({ title: "Velha", parentId: root.id });
    const kid = await create({ title: "Filha", parentId: root.id });
    await app.call("DELETE", `/pages/${old.id}`, { cookies });
    app.clock.ms += 1000;
    await app.call("DELETE", `/pages/${root.id}`, { cookies });
    await app.call("POST", `/pages/${root.id}/restore`, { cookies });
    expect(await treeTitles()).toEqual(["Filha", "Raiz"]);
    expect((await app.call("GET", `/pages/${old.id}`, { cookies })).status).toBe(404);
    expect(kid.title).toBe("Filha");
  });

  it("restaurar uma filha cujo pai continua na lixeira a leva para a raiz", async () => {
    const root = await create({ title: "Raiz" });
    const kid = await create({ title: "Filha", parentId: root.id });
    app.clock.ms += 1000;
    await app.call("DELETE", `/pages/${kid.id}`, { cookies });
    app.clock.ms += 1000;
    await app.call("DELETE", `/pages/${root.id}`, { cookies });

    const trash = (await app.call("GET", "/pages/trash", { cookies })).body as { items: { id: string; title: string }[] };
    expect(trash.items.map((i) => i.title).sort()).toEqual(["Filha", "Raiz"]);

    const res = await app.call("POST", `/pages/${kid.id}/restore`, { cookies });
    expect((res.body as { page: PageJson }).page.parentId).toBeNull();
    expect(await treeTitles()).toEqual(["Filha"]);
  });

  it("404 ao restaurar o que não está na lixeira", async () => {
    const page = await create();
    expect((await app.call("POST", `/pages/${page.id}/restore`, { cookies })).status).toBe(404);
  });
});

describe("busca", () => {
  async function search(q: string, extra: Record<string, string> = {}) {
    const res = await app.call("GET", "/pages/search", { cookies, query: { q, ...extra } });
    expect(res.status).toBe(200);
    return (res.body as { hits: { id: string; title: string; matchIn: string; snippet: string }[] }).hits;
  }

  it("acha por título e por conteúdo, título primeiro", async () => {
    await create({ title: "Consenso com Raft", body: doc("O líder replica o log") });
    await create({ title: "Anotações soltas", body: doc("Estudar Raft amanhã") });
    const hits = await search("raft");
    expect(hits.map((h) => [h.title, h.matchIn])).toEqual([
      ["Consenso com Raft", "title"],
      ["Anotações soltas", "content"],
    ]);
  });

  it("casa por prefixo enquanto se digita", async () => {
    await create({ title: "Consenso com Raft" });
    expect((await search("raf")).map((h) => h.title)).toEqual(["Consenso com Raft"]);
    expect((await search("con raf")).map((h) => h.title)).toEqual(["Consenso com Raft"]);
  });

  it("ignora acentos de um lado e do outro", async () => {
    await create({ title: "Reunião de revisão", body: doc("Pauta da ação") });
    expect((await search("reuniao")).length).toBe(1);
    expect((await search("reunião")).length).toBe(1);
    expect((await search("revisao")).length).toBe(1);
    expect((await search("acao")).length).toBe(1);
  });

  it("encontra a forma plural pela singular (radical do português)", async () => {
    await create({ title: "Anotações do projeto" });
    expect((await search("anotacoes")).length).toBe(1);
    expect((await search("projetos")).length).toBe(1);
  });

  it("marca o termo no trecho com U+0001 e U+0002, nunca com HTML", async () => {
    await create({ title: "x", body: doc("antes do termo cache depois <b>html</b>") });
    const [hit] = await search("cache");
    expect(hit!.snippet).toContain("\u0001cache\u0002");
    expect(hit!.snippet).not.toContain("<mark>");
  });

  it("ignora páginas na lixeira", async () => {
    const page = await create({ title: "Segredo" });
    await app.call("DELETE", `/pages/${page.id}`, { cookies });
    expect(await search("segredo")).toEqual([]);
  });

  it("tolera consulta vazia e caracteres especiais", async () => {
    await create({ title: "Raft" });
    expect(await search("")).toEqual([]);
    expect(await search("   ")).toEqual([]);
    expect(await search("!!! ' & | ( ) :*")).toEqual([]);
    expect((await search("raft'; drop table pages;--")).length).toBe(0);
    expect((await app.call("GET", "/pages/tree", { cookies })).status).toBe(200);
  });

  it("respeita o limite e valida parâmetros", async () => {
    for (let i = 0; i < 3; i++) await create({ title: `Nota ${i}` });
    expect((await search("nota", { limit: "2" })).length).toBe(2);
    expect((await app.call("GET", "/pages/search", { cookies, query: { q: "a", limit: "0" } })).status).toBe(400);
    expect((await app.call("GET", "/pages/search", { cookies, query: { q: "a", limit: "51" } })).status).toBe(400);
    expect((await app.call("GET", "/pages/search", { cookies, query: { q: "a".repeat(201) } })).status).toBe(400);
  });

  it("atualiza o índice quando o corpo muda", async () => {
    const page = await create({ title: "Nota", body: doc("alfa") });
    await app.call("PATCH", `/pages/${page.id}`, { cookies, body: { body: doc("beta") } });
    expect(await search("alfa")).toEqual([]);
    expect((await search("beta")).length).toBe(1);
  });
});

describe("backlinks", () => {
  async function backlinks(id: string): Promise<string[]> {
    const res = await app.call("GET", `/pages/${id}/backlinks`, { cookies });
    expect(res.status).toBe(200);
    return (res.body as { pages: { title: string }[] }).pages.map((p) => p.title);
  }

  it("lista quem cita a página por [[título]], sem diferenciar maiúsculas", async () => {
    const raft = await create({ title: "Consenso com Raft" });
    await create({ title: "Resumo", body: doc("Ver [[consenso  com RAFT]] para detalhes") });
    await create({ title: "Outra", body: doc("sem links") });
    expect(await backlinks(raft.id)).toEqual(["Resumo"]);
  });

  it("não conta a própria página nem links repetidos duas vezes", async () => {
    const raft = await create({ title: "Raft", body: doc("[[Raft]]") });
    await create({ title: "Citadora", body: doc("[[Raft]] e de novo [[Raft]]") });
    expect(await backlinks(raft.id)).toEqual(["Citadora"]);
  });

  it("remove o backlink quando o link sai do corpo", async () => {
    const raft = await create({ title: "Raft" });
    const src = await create({ title: "Fonte", body: doc("[[Raft]]") });
    expect(await backlinks(raft.id)).toEqual(["Fonte"]);
    await app.call("PATCH", `/pages/${src.id}`, { cookies, body: { body: doc("nada") } });
    expect(await backlinks(raft.id)).toEqual([]);
    await app.call("PATCH", `/pages/${src.id}`, { cookies, body: { body: doc("[[raft]] de volta") } });
    expect(await backlinks(raft.id)).toEqual(["Fonte"]);
  });

  it("segue o título: renomear a página alvo desfaz o vínculo", async () => {
    const raft = await create({ title: "Raft" });
    await create({ title: "Fonte", body: doc("[[Raft]]") });
    await app.call("PATCH", `/pages/${raft.id}`, { cookies, body: { title: "Paxos" } });
    expect(await backlinks(raft.id)).toEqual([]);
    await app.call("PATCH", `/pages/${raft.id}`, { cookies, body: { title: "raft" } });
    expect(await backlinks(raft.id)).toEqual(["Fonte"]);
  });

  it("ignora quem está na lixeira", async () => {
    const raft = await create({ title: "Raft" });
    const src = await create({ title: "Fonte", body: doc("[[Raft]]") });
    await app.call("DELETE", `/pages/${src.id}`, { cookies });
    expect(await backlinks(raft.id)).toEqual([]);
  });

  it("vazio para página sem título ou inexistente", async () => {
    const untitled = await create();
    expect(await backlinks(untitled.id)).toEqual([]);
    expect(await backlinks("11111111-1111-4111-8111-111111111111")).toEqual([]);
  });

  it("cria links também na criação da página", async () => {
    const raft = await create({ title: "Raft" });
    await create({ title: "Nova", body: doc("[[Raft]]") });
    expect(await backlinks(raft.id)).toEqual(["Nova"]);
  });
});
