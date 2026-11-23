import { firstLink, itemNote, itemTitle, nodeText } from "./checks.js";

/** Árvore para a tela da meta: grupos (títulos da página) > itens (cursos) > seções > aulas. */
export interface OutlineLesson {
  text: string;
  checked: boolean;
  /** Anotação escrita dentro do checkbox ("" se não há). */
  note: string;
}
export interface OutlineSection {
  title: string;
  done: number;
  total: number;
  lessons: OutlineLesson[];
}
export interface OutlineItem {
  title: string;
  /** Página do curso (quando o item aponta para uma página filha); senão null. */
  pageId: string | null;
  done: number;
  total: number;
  sections: OutlineSection[];
}
export interface OutlineGroup {
  title: string | null;
  done: number;
  total: number;
  items: OutlineItem[];
}
export interface ChildPage {
  id: string;
  title: string;
  body: unknown;
  /** Endereço de origem normalizado (ou null). */
  source: string | null;
}

type Node = { type?: unknown; attrs?: Record<string, unknown>; content?: unknown };
const kids = (n: unknown): unknown[] => (typeof n === "object" && n !== null && Array.isArray((n as Node).content) ? ((n as Node).content as unknown[]) : []);
const typeOf = (n: unknown) => (typeof n === "object" && n !== null ? (n as Node).type : undefined);

/** Todos os taskItem dentro de uma lista, inclusive aninhados. */
function taskItems(node: unknown, out: Node[] = []): Node[] {
  if (typeOf(node) === "taskItem") out.push(node as Node);
  for (const c of kids(node)) taskItems(c, out);
  return out;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Seções e aulas de uma página de curso: títulos viram seções, checkboxes viram aulas. */
function sectionsOf(body: unknown): OutlineSection[] {
  const sections: OutlineSection[] = [];
  let current: OutlineSection | null = null;
  for (const block of kids(body)) {
    if (typeOf(block) === "heading") {
      current = { title: clean(nodeText(block)), done: 0, total: 0, lessons: [] };
      sections.push(current);
    } else if (typeOf(block) === "taskList") {
      if (!current) {
        current = { title: "", done: 0, total: 0, lessons: [] };
        sections.push(current);
      }
      for (const item of taskItems(block)) {
        const checked = item.attrs?.checked === true;
        current.lessons.push({ text: clean(nodeText(itemTitle(item))), checked, note: itemNote(item) });
        current.total++;
        if (checked) current.done++;
      }
    }
  }
  return sections.filter((s) => s.total > 0);
}

export function buildOutline(rootBody: unknown, children: ChildPage[]): OutlineGroup[] {
  const bySource = new Map(children.filter((c) => c.source).map((c) => [c.source!, c]));
  const groups: OutlineGroup[] = [];
  let group: OutlineGroup | null = null;
  const open = (title: string | null) => {
    group = { title, done: 0, total: 0, items: [] };
    groups.push(group);
    return group;
  };
  for (const block of kids(rootBody)) {
    if (typeOf(block) === "heading") {
      open(clean(nodeText(block)));
    } else if (typeOf(block) === "taskList") {
      const g = group ?? open(null);
      for (const item of taskItems(block)) {
        const title = clean(nodeText(itemTitle(item)));
        const link = firstLink(itemTitle(item));
        const child = link ? bySource.get(link) : undefined;
        let entry: OutlineItem;
        if (child) {
          const sections = sectionsOf(child.body);
          entry = { title, pageId: child.id, done: sections.reduce((t, s) => t + s.done, 0), total: sections.reduce((t, s) => t + s.total, 0), sections };
        } else {
          const checked = item.attrs?.checked === true;
          entry = { title, pageId: null, done: checked ? 1 : 0, total: 1, sections: [] };
        }
        g.items.push(entry);
        g.done += entry.done;
        g.total += entry.total;
      }
    }
  }
  return groups.filter((g) => g.items.length > 0);
}
