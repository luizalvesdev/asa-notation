import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, doc, type TestApp } from "./helpers.js";

let app: TestApp;
let cookies: Record<string, string>;

beforeEach(async () => {
  app = await createTestApp();
  cookies = await app.owner();
});

const MIN = 60_000;
const call = (method: string, path: string, body?: unknown) => app.call(method, path, { cookies, body });

async function page(title = "Raft", ...paragraphs: string[]) {
  const res = await call("POST", "/pages", { title, body: doc(...paragraphs) });
  return (res.body as { page: { id: string; rev: number } }).page;
}
const edit = (id: string, ...paragraphs: string[]) => call("PATCH", `/pages/${id}`, { body: doc(...paragraphs) });
const versions = async (id: string) => ((await call("GET", `/pages/${id}/versions`)).body as { versions: { id: number; title: string; excerpt: string; createdAt: string }[] }).versions;

describe("histórico de versões", () => {
  it("exige sessão", async () => {
    const p = await page();
    expect((await app.call("GET", `/pages/${p.id}/versions`)).status).toBe(401);
  });

  it("a primeira edição guarda o estado anterior", async () => {
    const p = await page("Raft", "versão um");
    await edit(p.id, "versão dois");
    const list = await versions(p.id);
    expect(list).toHaveLength(1);
    expect(list[0]!.excerpt).toBe("versão um");
  });

  it("não cria outra versão em menos de 10 minutos", async () => {
    const p = await page("Raft", "a");
    await edit(p.id, "b");
    app.clock.ms += 5 * MIN;
    await edit(p.id, "c");
    expect(await versions(p.id)).toHaveLength(1);
  });

  it("cria outra depois de 10 minutos, com o estado daquele momento", async () => {
    const p = await page("Raft", "a");
    await edit(p.id, "b");
    app.clock.ms += 11 * MIN;
    cookies = await app.owner();
    await edit(p.id, "c");
    expect((await versions(p.id)).map((v) => v.excerpt)).toEqual(["b", "a"]);
  });

  it("salvar o mesmo conteúdo ou só o título não cria versão", async () => {
    const p = await page("Raft", "a");
    await edit(p.id, "a");
    await call("PATCH", `/pages/${p.id}`, { title: "Outro" });
    expect(await versions(p.id)).toEqual([]);
  });

  it("página sem corpo ainda não tem o que guardar", async () => {
    const res = await call("POST", "/pages", { title: "Vazia" });
    const id = (res.body as { page: { id: string } }).page.id;
    await edit(id, "primeiro texto");
    expect(await versions(id)).toEqual([]);
  });

  it("edição com conflito de revisão não gera versão", async () => {
    const p = await page("Raft", "a");
    const res = await call("PATCH", `/pages/${p.id}`, { body: doc("b"), baseRev: p.rev + 999 });
    expect(res.status).toBe(409);
    expect(await versions(p.id)).toEqual([]);
  });

  it("lê uma versão completa e valida ids", async () => {
    const p = await page("Raft", "texto antigo");
    await edit(p.id, "texto novo");
    const [v] = await versions(p.id);
    const res = await call("GET", `/pages/${p.id}/versions/${v!.id}`);
    expect((res.body as { version: { title: string; body: unknown } }).version).toMatchObject({ title: "Raft", body: doc("texto antigo") });
    expect((await call("GET", `/pages/${p.id}/versions/999999`)).status).toBe(404);
    const other = await page("Outra", "x");
    expect((await call("GET", `/pages/${other.id}/versions/${v!.id}`)).status).toBe(404);
    expect((await call("GET", "/pages/00000000-0000-4000-8000-000000000000/versions")).status).toBe(404);
  });

  it("restaurar volta ao conteúdo e guarda o estado atual para desfazer", async () => {
    const p = await page("Raft", "texto antigo");
    await edit(p.id, "texto novo");
    const [v] = await versions(p.id);
    const res = await call("POST", `/pages/${p.id}/versions/${v!.id}/restore`);
    expect(res.status).toBe(200);
    const current = ((await call("GET", `/pages/${p.id}`)).body as { page: { body: unknown } }).page;
    expect(current.body).toEqual(doc("texto antigo"));
    expect((await versions(p.id)).map((x) => x.excerpt)).toEqual(["texto novo", "texto antigo"]);
  });

  it("guarda só as últimas 100 versões", async () => {
    const p = await page("Raft", "v0");
    for (let i = 1; i <= 103; i++) {
      app.clock.ms += 11 * MIN;
      await edit(p.id, `v${i}`);
      if (i % 5 === 0) cookies = await app.owner();
    }
    const list = await versions(p.id);
    expect(list).toHaveLength(50); // a lista mostra as 50 mais recentes
    const total = await app.db.query("select count(*)::int as n from page_versions where page_id = $1", [p.id]);
    expect((total.rows[0] as { n: number }).n).toBe(100);
  });
});

describe("link público", () => {
  const share = async (id: string) => (await call("POST", `/pages/${id}/share`)).body as { share: { slug: string; views: number } };
  const read = (slug: string) => app.call("GET", `/public/${slug}`);

  it("publica, devolve sempre o mesmo link e permite ler sem login", async () => {
    const p = await page("Consenso", "texto público");
    const a = await share(p.id);
    const b = await share(p.id);
    expect(a.share.slug).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(b.share.slug).toBe(a.share.slug);
    const res = await read(a.share.slug);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ page: expect.objectContaining({ title: "Consenso", body: doc("texto público") }) });
  });

  it("não vaza identificadores nem a árvore", async () => {
    const parent = await page("Pai", "x");
    const child = ((await call("POST", "/pages", { title: "Filha", parentId: parent.id, body: doc("y") })).body as { page: { id: string } }).page;
    const { share: s } = await share(child.id);
    const body = JSON.stringify((await read(s.slug)).body);
    expect(Object.keys(((JSON.parse(body) as { page: object }).page))).toEqual(["title", "icon", "cover", "kind", "body", "updatedAt"]);
    expect(body).not.toContain(child.id);
    expect(body).not.toContain(parent.id);
  });

  it("conta visitas", async () => {
    const p = await page("A", "x");
    const { share: s } = await share(p.id);
    await read(s.slug);
    await read(s.slug);
    const info = ((await call("GET", `/pages/${p.id}/share`)).body as { share: { views: number } }).share;
    expect(info.views).toBe(2);
  });

  it("despublicar, apagar a página ou usar slug errado dá 404", async () => {
    const p = await page("A", "x");
    const { share: s } = await share(p.id);
    expect((await read("naoexiste123")).status).toBe(404);
    expect((await call("DELETE", `/pages/${p.id}/share`)).status).toBe(200);
    expect((await read(s.slug)).status).toBe(404);
    expect((await call("DELETE", `/pages/${p.id}/share`)).status).toBe(404);

    const again = (await share(p.id)).share;
    expect(again.slug).not.toBe(s.slug);
    await call("DELETE", `/pages/${p.id}`);
    expect((await read(again.slug)).status).toBe(404);
  });

  it("a rota pública não aceita slug curto nem caracteres estranhos", async () => {
    expect((await read("abc")).status).toBe(404);
    expect((await app.call("GET", "/public/a%2Fb")).status).toBe(404);
  });

  it("compartilhar página inexistente dá 404 e a rota de gestão exige sessão", async () => {
    expect((await call("POST", "/pages/00000000-0000-4000-8000-000000000000/share")).status).toBe(404);
    const p = await page("A", "x");
    expect((await app.call("POST", `/pages/${p.id}/share`)).status).toBe(401);
  });
});
