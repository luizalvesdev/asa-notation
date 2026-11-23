import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";

/**
 * O que a extensão tira da aba aberta. Roda dentro da página, com o login do usuário,
 * então lê também conteúdo de área de aluno (Alura, faculdade) que o servidor não acessa.
 */

export type ClipKind = "selection" | "transcript" | "article" | "course" | "lessons";

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

/**
 * Índice de uma carreira ou formação da Alura (cursos.alura.com.br/dashboard/career/...): vira uma lista de tarefas,
 * um item por curso, agrupada por nível. Os níveis fechados já estão no HTML, só escondidos.
 */
export function findCourseIndex(doc: Document, baseUrl: string): { title: string; markdown: string } | null {
  const groups: string[] = [];
  let courses = 0;
  for (const item of doc.querySelectorAll(".ds-accordion-item")) {
    const steps = [...item.querySelectorAll(".career-step")];
    if (steps.length === 0) continue;
    const level = clean(item.querySelector(".ds-accordion-title")?.textContent ?? "");
    const lines: string[] = [];
    for (const step of steps) {
      const name = clean(step.querySelector(".step-description > p:first-child")?.textContent ?? "");
      if (!name) continue;
      const about = clean(step.querySelector(".description-text")?.textContent ?? "");
      const progress = clean(step.querySelector(".text-card-body")?.textContent ?? "");
      let href = "";
      try {
        href = new URL(step.closest("a")?.getAttribute("href") ?? "", baseUrl).href;
      } catch {}
      const label = clean(name.replace(/[\[\]]/g, " "));
      const link = /^https?:\/\//.test(href) && !/[)\s]/.test(href) ? `[${label}](${href})` : label;
      lines.push(`- [${progress === "100%" ? "x" : " "}] ${link}${about ? ` — ${about}` : ""}`);
    }
    if (lines.length === 0) continue;
    courses += lines.length;
    groups.push(`${level ? `## ${level}\n\n` : ""}${lines.join("\n")}`);
  }
  if (courses === 0) return null;
  const title = clean(doc.querySelector("h2")?.textContent ?? "");
  return { title, markdown: groups.join("\n\n") };
}

/**
 * Página de um curso da Alura (cursos.alura.com.br/course/...): cada seção ("módulo") vira um título e cada aula
 * um checkbox. Seção que a Alura mostra como completa (10 / 10) já vem marcada; parcial só informa o andamento,
 * porque a página não diz quais aulas foram feitas.
 */
export function findCourseLessons(doc: Document): { markdown: string; lessons: number } | null {
  const items = doc.querySelectorAll('.ds-accordion[class*="course-progress"] > .ds-accordion-item');
  const parts: string[] = [];
  let lessons = 0;
  for (const item of items) {
    const titles = [...item.querySelectorAll(".ds-accordion-body li")].map((li) => clean(li.textContent ?? "")).filter(Boolean);
    if (titles.length === 0) continue;
    const head = item.querySelector(".ds-accordion-header");
    // Cada trecho do cabeçalho separado (textContent cola "0 / 10" com "36min").
    const bits = [...(head?.querySelectorAll("*") ?? [])].filter((e) => e.children.length === 0).map((e) => clean(e.textContent ?? "")).filter(Boolean);
    const name = clean(head?.querySelector("a")?.textContent ?? "") || bits[0] || "";
    const progress = bits.map((b) => /^(\d+)\s*\/\s*(\d+)$/.exec(b)).find(Boolean) ?? null;
    const duration = bits.find((b) => /^(\d+\s*h(\s*\d+\s*min)?|\d+\s*min)$/i.test(b));
    const complete = !!progress && Number(progress[2]) > 0 && progress[1] === progress[2];
    const info = [`${titles.length} ${titles.length === 1 ? "aula" : "aulas"}`, duration?.replace(/\s+/g, ""), progress && !complete && Number(progress[1]) > 0 ? `${progress[1]} de ${progress[2]} feitas na Alura` : null].filter(Boolean).join(" · ");
    parts.push(`## ${name || "Seção"}\n\n${info}\n\n${titles.map((t) => `- [${complete ? "x" : " "}] ${t}`).join("\n")}`);
    lessons += titles.length;
  }
  return lessons === 0 ? null : { markdown: parts.join("\n\n"), lessons };
}

/** Cursos listados numa carreira da Alura, na ordem da página: nome e endereço de cada um. */
export function findCourseLinks(doc: Document, baseUrl: string): { title: string; href: string }[] {
  const out: { title: string; href: string }[] = [];
  const seen = new Set<string>();
  for (const step of doc.querySelectorAll(".career-step")) {
    const title = clean(step.querySelector(".step-description > p:first-child")?.textContent ?? "");
    let href = "";
    try {
      href = new URL(step.closest("a")?.getAttribute("href") ?? "", baseUrl).href;
    } catch {}
    if (!title || !/^https?:\/\//.test(href) || seen.has(href)) continue;
    seen.add(href);
    out.push({ title, href });
  }
  return out;
}

/** Título de uma aba da Alura sem o rodapé ("| Alura - Cursos online de tecnologia"). */
export function cleanTitle(raw: string): string {
  return clean(raw).replace(/\s+[|\-–—]\s+(Alura|YouTube)\b.*$/i, "");
}

/** Lê uma página de curso já baixada (HTML de outra página) e devolve as aulas, ou o motivo de não ter. */
export function parseCoursePage(doc: Document): { ok: true; title: string; markdown: string; lessons: number } | { ok: false; reason: "no_lessons" | "coming_soon" } {
  const found = findCourseLessons(doc);
  // Curso anunciado mas ainda sem aulas: a Alura põe "[EM BREVE]" no título da página.
  if (!found) return { ok: false, reason: /\[\s*em breve\s*\]/i.test(doc.title || "") ? "coming_soon" : "no_lessons" };
  return { ok: true, title: cleanTitle(doc.title || ""), markdown: found.markdown, lessons: found.lessons };
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
  const pageTitle = clean(doc.title || url).replace(/\s+[|\-–—]\s+(Alura|YouTube)\b.*$/i, "");
  const fullText = () => clean(doc.body?.innerText ?? doc.body?.textContent ?? "").slice(0, MAX_TEXT);

  const sel = selectionHtml(win);
  if (sel) return { kind: "selection", title: pageTitle, url, markdown: toMarkdown(sel.html) || sel.text, text: sel.text.slice(0, MAX_TEXT) };

  const course = findCourseIndex(doc, url);
  if (course) return { kind: "course", title: course.title || pageTitle, url, markdown: course.markdown, text: fullText() };

  const lessons = findCourseLessons(doc);
  if (lessons) return { kind: "lessons", title: pageTitle, url, markdown: lessons.markdown, text: fullText() };

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
