import { strToU8, zipSync } from "fflate";
import { docToMarkdown } from "./doc-to-markdown";

export interface ExportPage {
  id: string;
  parent_id: string | null;
  title: string;
  body: unknown;
}

/** Nome seguro para arquivo: sem barras, pontos finais nem caracteres reservados. */
export function safeName(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+|\.+$/g, "").slice(0, 80).trim();
  return cleaned === "" ? "Sem título" : cleaned;
}

/**
 * Caminhos .md que espelham a árvore: a página `Pai` vira `Pai.md` e as filhas ficam em `Pai/`.
 * Nomes repetidos na mesma pasta ganham " (2)", " (3)"...
 */
export function pagePaths(pages: readonly ExportPage[]): Map<string, string> {
  const byParent = new Map<string | null, ExportPage[]>();
  for (const p of pages) {
    // Pai que não está no export (apagado) vira raiz.
    const parent = p.parent_id && pages.some((x) => x.id === p.parent_id) ? p.parent_id : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), p]);
  }
  const paths = new Map<string, string>();
  const walk = (parent: string | null, dir: string) => {
    const used = new Set<string>();
    for (const page of byParent.get(parent) ?? []) {
      const base = safeName(page.title);
      let name = base;
      for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n})`;
      used.add(name.toLowerCase());
      paths.set(page.id, `${dir}${name}.md`);
      walk(page.id, `${dir}${name}/`);
    }
  };
  walk(null, "");
  return paths;
}

export function buildMarkdownZip(pages: readonly ExportPage[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const [id, path] of pagePaths(pages)) {
    const page = pages.find((p) => p.id === id)!;
    files[path] = strToU8(`# ${page.title.trim() || "Sem título"}\n\n${docToMarkdown(page.body)}`);
  }
  return zipSync(files);
}
