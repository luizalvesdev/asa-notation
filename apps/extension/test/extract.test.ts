// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { ApiError, createApi, errorMessage, folderOptions, normalizeServer } from "../src/api.js";
import { extract, findCourseIndex, findCourseLessons, findTranscript, toMarkdown } from "../src/extract.js";

const LONG = "Neste vídeo a gente vai entender como o Kafka distribui as mensagens entre as partições de um tópico. ".repeat(4);

beforeEach(() => {
  document.title = "Kafka na prática | Alura";
  document.body.innerHTML = "";
  window.getSelection()?.removeAllRanges();
});

describe("markdown", () => {
  it("títulos até ###, código com linguagem, imagem só http(s) e sem escapes", () => {
    const md = toMarkdown(
      '<h2>Partições</h2><h5>Detalhe</h5><p>Use <strong>acks=all</strong> e <em>idempotência</em> em 2_000 * msgs.</p><pre><code class="language-java">producer.send(r);</code></pre><img src="https://cdn.x/a.png" alt="diagrama"><img src="data:image/png;base64,AAA">',
    );
    expect(md).toBe("## Partições\n\n### Detalhe\n\nUse **acks=all** e *idempotência* em 2_000 * msgs.\n\n```java\nproducer.send(r);\n```\n\n![diagrama](https://cdn.x/a.png)");
  });
});

describe("links", () => {
  it("espaço do link vai para fora; imagem com link vira só imagem; banner com utm sai", () => {
    const md = toMarkdown(
      '<p>Veja o <a href="https://a.com/x">artigo sobre IA </a>, depois.</p><p><a href="https://a.com/img"><img src="https://cdn.x/foto.png" alt="foto"></a></p><p><a href="https://www.alura.com.br/promocao/blackfriday?utm_source=blog"><img src="https://cdn.x/banner.png" alt="Banner"></a></p>',
    );
    expect(md).toBe("Veja o [artigo sobre IA](https://a.com/x), depois.\n\n![foto](https://cdn.x/foto.png)");
  });
});

describe("transcrição", () => {
  it("acha o bloco de transcrição da aula e tira o título", () => {
    document.body.innerHTML = `<nav>Menu</nav><section class="video-transcription"><h3>Transcrição</h3><p>${LONG}</p></section>`;
    const md = findTranscript(document)!;
    expect(md.startsWith("Neste vídeo")).toBe(true);
  });

  it("acha pelo título 'Transcrição' seguido do conteúdo", () => {
    document.body.innerHTML = `<h2>Transcrição</h2><div><p>${LONG}</p></div>`;
    expect(findTranscript(document)).toContain("partições de um tópico");
  });

  it("junta os trechos do painel do YouTube com o tempo", () => {
    document.body.innerHTML = `<ytd-transcript-segment-renderer><div class="segment-timestamp">0:01</div><div class="segment-text">Olá</div></ytd-transcript-segment-renderer><ytd-transcript-segment-renderer><div class="segment-timestamp">0:05</div><div class="segment-text">pessoal</div></ytd-transcript-segment-renderer>`;
    expect(findTranscript(document)).toBe("**0:01** Olá\n\n**0:05** pessoal");
  });

  it("bloco curto não conta como transcrição", () => {
    document.body.innerHTML = `<div class="transcription-toggle">Ver transcrição</div>`;
    expect(findTranscript(document)).toBeNull();
  });
});

describe("índice de curso (carreira da Alura)", () => {
  const step = (n: string, name: string, about: string, pct: string, path: string) =>
    `<div class="ds-accordion-body"><a class="career-step-wrapper" href="${path}"><div class="career-step"><span class="step-title">${n}</span><div class="step-description"><p class="font-sans">${name}</p>${about ? `<p class="description-text">${about}</p>` : ""}</div><span class="text-card-body">${pct}</span></div></a></div>`;
  const level = (title: string, body: string) => `<div class="ds-accordion-item"><div class="ds-accordion-header"><span class="ds-accordion-title">${title}</span></div><div class="ds-accordion-content">${body}</div></div>`;

  it("um item por curso, agrupado por nível, com link, subtítulo e check nos concluídos", () => {
    document.body.innerHTML = `<h2>Desenvolvimento Back-End .NET</h2>
      ${level("Comunidade", "<p>Fórum</p>")}
      ${level("Base - Pensamento Computacional", step("01", "Pensamento computacional", "fundamentos da lógica", "0%", "/course/pc") + step("02", "C#", "criando sua primeira aplicação", "100%", "/course/csharp"))}
      ${level("Nível 3", step("01", "Arquitetura [moderna]", "", "0%", "/course/arq"))}`;
    const out = findCourseIndex(document, "https://cursos.alura.com.br/dashboard/career/x")!;
    expect(out.title).toBe("Desenvolvimento Back-End .NET");
    expect(out.markdown).toBe(
      [
        "## Base - Pensamento Computacional",
        "",
        "- [ ] [Pensamento computacional](https://cursos.alura.com.br/course/pc) — fundamentos da lógica",
        "- [x] [C#](https://cursos.alura.com.br/course/csharp) — criando sua primeira aplicação",
        "",
        "## Nível 3",
        "",
        "- [ ] [Arquitetura moderna](https://cursos.alura.com.br/course/arq)",
      ].join("\n"),
    );
  });

  it("sem cursos na página não é índice, e extract() devolve o tipo course", () => {
    document.body.innerHTML = `<p>nada</p>`;
    expect(findCourseIndex(document, "https://a.com")).toBeNull();
    document.body.innerHTML = `<h2>Carreira X</h2>${level("Base", step("01", "C#", "", "0%", "/course/c"))}`;
    const out = extract(window);
    expect(out.kind).toBe("course");
    expect(out.title).toBe("Carreira X");
  });
});

describe("aulas de um curso da Alura", () => {
  const section = (name: string, progress: string, time: string, lessons: string[]) =>
    `<div class="ds-accordion-item"><div class="ds-accordion-header"><div><div><a class="font-brand">${name}</a></div><button>Ver primeiro vídeo</button><span>${progress}</span><span>${time}</span></div></div><div class="ds-accordion-content"><div class="ds-accordion-body"><ul>${lessons.map((l) => `<li><span>${l}</span></li>`).join("")}</ul></div></div></div>`;

  it("seção vira título, aula vira checkbox; progresso e duração lidos separados", () => {
    document.title = "Pensamento computacional: fundamentos | Alura - Cursos online de tecnologia";
    document.body.innerHTML = `<h2>Aulas</h2><div class="ds-accordion flex course-progress-information-x">${section("Mundo da Computação", "0 / 10", "36min", ["Apresentação", "Para saber mais", "Papel da pessoa desenvolvedora"])}${section("Lógica", "2 / 3", "1h 5min", ["a", "b", "c"])}</div>`;
    const out = findCourseLessons(document)!;
    expect(out.lessons).toBe(6);
    expect(out.markdown).toBe(
      [
        "## Mundo da Computação",
        "",
        "3 aulas · 36min",
        "",
        "- [ ] Apresentação",
        "- [ ] Para saber mais",
        "- [ ] Papel da pessoa desenvolvedora",
        "",
        "## Lógica",
        "",
        "3 aulas · 1h5min · 2 de 3 feitas na Alura",
        "",
        "- [ ] a",
        "- [ ] b",
        "- [ ] c",
      ].join("\n"),
    );
    const e = extract(window);
    expect(e.kind).toBe("lessons");
    expect(e.title).toBe("Pensamento computacional: fundamentos");
  });

  it("seção completa na Alura (3 / 3) já vem marcada; sem seções não é curso", () => {
    document.body.innerHTML = `<div class="ds-accordion course-progress-information-x">${section("Feita", "3 / 3", "20min", ["x", "y", "z"])}</div>`;
    expect(findCourseLessons(document)!.markdown).toContain("- [x] x\n- [x] y\n- [x] z");
    document.body.innerHTML = `<div class="ds-accordion"><div class="ds-accordion-item"><div class="ds-accordion-header">Fórum</div></div></div>`;
    expect(findCourseLessons(document)).toBeNull();
  });
});

describe("extract", () => {
  it("seleção ganha de tudo", () => {
    document.body.innerHTML = `<p id="a">Primeiro <b>trecho</b> escolhido</p><section class="transcription"><p>${LONG}</p></section>`;
    const range = document.createRange();
    range.selectNodeContents(document.getElementById("a")!);
    window.getSelection()!.addRange(range);
    const out = extract(window);
    expect(out.kind).toBe("selection");
    expect(out.markdown).toBe("Primeiro **trecho** escolhido");
    expect(out.text).toBe("Primeiro trecho escolhido");
    expect(out.title).toBe("Kafka na prática");
  });

  it("transcrição quando há; senão o artigo", () => {
    document.body.innerHTML = `<section class="transcription"><p>${LONG}</p></section>`;
    expect(extract(window).kind).toBe("transcript");

    document.body.innerHTML = `<header><a href="/">Início</a></header><article><h1>Kafka na prática</h1>${"<p>Um consumer group divide as partições de um tópico entre os consumidores, e cada partição fica com um único consumidor do grupo.</p>".repeat(6)}</article><footer>Rodapé</footer>`;
    const art = extract(window);
    expect(art.kind).toBe("article");
    expect(art.markdown).toContain("consumer group");
    expect(art.markdown).not.toContain("Rodapé");
  });
});

describe("api", () => {
  it("endereço: só https, ou http local", () => {
    expect(normalizeServer(" https://asa.luizalves.dev/ ")).toBe("https://asa.luizalves.dev");
    expect(normalizeServer("http://localhost:5173/x")).toBe("http://localhost:5173");
    expect(normalizeServer("http://asa.luizalves.dev")).toBeNull();
    expect(normalizeServer("nada")).toBeNull();
  });

  it("pastas em ordem, dois níveis, sem bancos e canvas", () => {
    const p = (id: string, parentId: string | null, position: string, kind = "page") => ({ id, parentId, title: id, icon: null, kind, position });
    expect(folderOptions([p("b", null, "b"), p("a", null, "a"), p("a1", "a", "a"), p("a11", "a1", "a"), p("db", null, "c", "database")])).toEqual([
      { id: "a", label: "a" },
      { id: "a1", label: "   a1" },
      { id: "b", label: "b" },
    ]);
  });

  it("manda o token e traduz os erros", async () => {
    let seen: { url: string; auth: string } | null = null;
    const api = createApi({ server: "https://asa.test", token: "asa_x" }, (async (url: string, init: RequestInit) => {
      seen = { url, auth: (init.headers as Record<string, string>).authorization! };
      return new Response(JSON.stringify({ error: "read_only_token" }), { status: 403 });
    }) as typeof fetch);
    const err = await api.clip({ url: "https://a.com", title: "t", markdown: "m", kind: "article", parentId: null }).catch((e) => e);
    expect(seen).toEqual({ url: "https://asa.test/api/clips", auth: "Bearer asa_x" });
    expect(err).toBeInstanceOf(ApiError);
    expect(errorMessage(err)).toContain("só de leitura");
  });
});
