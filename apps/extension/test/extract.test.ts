// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { ApiError, createApi, errorMessage, folderOptions, normalizeServer } from "../src/api.js";
import { extract, findTranscript, toMarkdown } from "../src/extract.js";

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
