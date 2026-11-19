import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";

/**
 * O que a extensão tira da aba aberta. Roda dentro da página, com o login do usuário,
 * então lê também conteúdo de área de aluno (Alura, faculdade) que o servidor não acessa.
 */

export type ClipKind = "selection" | "transcript" | "article";

export interface Extracted {
  kind: ClipKind;
  title: string;
  url: string;
  /** Conteúdo para salvar como página. */
  markdown: string;
  /** Texto puro para procurar datas (a seleção, ou a página inteira). */
  text: string;
}

const MAX_TEXT = 20_000;
const MIN_TRANSCRIPT = 200;

export function toMarkdown(html: string | Node): string {
  const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", emDelimiter: "*", strongDelimiter: "**", bulletListMarker: "-" });
  // O app entende títulos até ###.
  td.addRule("smallHeadings", { filter: ["h4", "h5", "h6"], replacement: (content) => `\n\n### ${content.trim()}\n\n` });
  // Imagem sem endereço http(s) (base64, blob) não vai.
  td.addRule("images", {
    filter: "img",
    replacement: (_content, node) => {
      const img = node as HTMLImageElement;
      const src = img.getAttribute("src") ?? "";
      return /^https?:\/\//i.test(src) ? `\n\n![${(img.getAttribute("alt") ?? "").replace(/[\[\]\n]/g, " ").trim()}](${src})\n\n` : "";
    },
  });
  td.addRule("links", {
    filter: (node) => node.nodeName === "A" && !!node.getAttribute("href"),
    replacement: (content, node) => {
      const a = node as HTMLAnchorElement;
      const href = a.getAttribute("href") ?? "";
      // Imagem com link em volta fica só a imagem; banner de propaganda (link com utm_) sai.
      if ((a.textContent ?? "").trim() === "" && a.querySelector("img")) return /[?&]utm_/i.test(href) ? "" : content;
      const text = content.trim();
      if (!text || !/^https?:\/\//i.test(href)) return content;
      return `[${text.replace(/\s*\n\s*/g, " ")}](${href})`;
    },
  });
  td.remove(["script", "style", "noscript", "iframe", "button", "form"]);
  // O app não desfaz escapes do Markdown: sem eles o texto fica limpo.
  td.escape = (s: string) => s;
  return td
    .turndown(html as string)
    // O espaço do fim de um link sai para fora dele; antes de pontuação, sobra ("texto ,").
    .replace(/(\]\([^)\s]+\)) +(?=[.,;:!?)])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const clean = (s: string) => s.replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();

/** Transcrição de vídeo: o painel do YouTube (aberto pelo usuário) ou a seção "Transcrição" de uma aula. */
export function findTranscript(doc: Document): string | null {
  const yt = [...doc.querySelectorAll("ytd-transcript-segment-renderer")].map((seg) => {
    const time = seg.querySelector(".segment-timestamp")?.textContent?.trim();
    const text = seg.querySelector(".segment-text")?.textContent?.trim();
    return text ? (time ? `**${time}** ${text}` : text) : "";
  }).filter(Boolean);
  if (yt.length > 0) return yt.join("\n\n");

  // Plataformas de curso (Alura e afins): bloco cujo id ou classe fala de transcrição.
  let best: Element | null = null;
  for (const el of doc.querySelectorAll('[id*="transcri" i], [class*="transcri" i]')) {
    const len = (el.textContent ?? "").trim().length;
    if (len >= MIN_TRANSCRIPT && len > (best?.textContent ?? "").trim().length) best = el;
  }
  // Senão, o conteúdo que vem logo depois de um título "Transcrição".
  if (!best) {
    for (const h of doc.querySelectorAll("h1, h2, h3, h4, summary, [role=tab], button")) {
      if (!/^\s*transcri[çc][ãa]o\b/i.test(h.textContent ?? "")) continue;
      const target = h.getAttribute("aria-controls");
      const panel = (target && doc.getElementById(target)) || h.nextElementSibling;
      if (panel && (panel.textContent ?? "").trim().length >= MIN_TRANSCRIPT) {
        best = panel;
        break;
      }
    }
  }
  if (!best) return null;
  const md = toMarkdown(best.cloneNode(true));
  // Tira o próprio título "Transcrição", se veio junto.
  return md.replace(/^#{1,3}\s*transcri[çc][ãa]o\s*\n+/i, "").trim() || null;
}

function selectionHtml(win: Window): { html: string; text: string } | null {
  const sel = win.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const text = sel.toString().trim();
  if (!text) return null;
  const box = win.document.createElement("div");
  for (let i = 0; i < sel.rangeCount; i++) box.appendChild(sel.getRangeAt(i).cloneContents());
  return { html: box.innerHTML, text };
}

export function extract(win: Window): Extracted {
  const doc = win.document;
  const url = win.location.href;
  const pageTitle = clean(doc.title || url).replace(/\s+[|\-–—]\s+(Alura|YouTube)$/i, "");
  const fullText = () => clean(doc.body?.innerText ?? doc.body?.textContent ?? "").slice(0, MAX_TEXT);

  const sel = selectionHtml(win);
  if (sel) return { kind: "selection", title: pageTitle, url, markdown: toMarkdown(sel.html) || sel.text, text: sel.text.slice(0, MAX_TEXT) };

  const transcript = findTranscript(doc);
  if (transcript) return { kind: "transcript", title: pageTitle, url, markdown: transcript, text: fullText() };

  const article = new Readability(doc.cloneNode(true) as Document, { keepClasses: true }).parse();
  const markdown = article?.content ? toMarkdown(article.content) : "";
  return {
    kind: "article",
    title: clean(article?.title || pageTitle),
    url,
    markdown: markdown || clean(article?.textContent ?? "") || fullText(),
    text: fullText(),
  };
}
