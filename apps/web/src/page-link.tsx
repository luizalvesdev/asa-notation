import { Extension } from "@tiptap/react";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { renderSlashMenu } from "./slash-command";
import type { MenuItem } from "./SlashMenu";
import { uiOf } from "./editor-nodes";
import { displayTitle } from "./pages-tree";
import { pageHash } from "./nav";

export interface PageItem extends MenuItem {
  pageId: string;
  pageTitle: string;
}

const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Páginas cujo título contém o termo (sem acento), as que começam com ele primeiro. Até 8. */
export function filterPages(pages: { id: string; title: string; icon: string | null }[], query: string): PageItem[] {
  const needle = normalize(query.trim());
  const all = pages
    .map((p) => ({ p, name: displayTitle(p.title) }))
    .filter(({ name }) => needle === "" || normalize(name).includes(needle));
  const starts = (name: string) => normalize(name).startsWith(needle);
  const ordered = [...all.filter(({ name }) => starts(name)), ...all.filter(({ name }) => !starts(name))];
  return ordered.slice(0, 8).map(({ p, name }) => ({ id: p.id, pageId: p.id, pageTitle: name, group: "Páginas", title: `${p.icon ?? "·"} ${name}`, description: "Link para a página" }));
}

/** O que `[[` e `@` inserem: o texto `[[Título]]` com um link para a página. O servidor acha os backlinks pelo texto. */
export function linkContent(item: Pick<PageItem, "pageId" | "pageTitle">) {
  return { type: "text", text: `[[${item.pageTitle}]]`, marks: [{ type: "link", attrs: { href: pageHash(item.pageId) } }] };
}

function pageSuggestion(name: string, char: string) {
  return Extension.create({
    name,
    addProseMirrorPlugins() {
      return [
        Suggestion<PageItem, PageItem>({
          pluginKey: new PluginKey(name),
          editor: this.editor,
          char,
          allowedPrefixes: null,
          allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
          items: ({ query }) => filterPages(uiOf(this.editor).pages, query),
          command: ({ editor, range, props }) => {
            editor.chain().focus().deleteRange(range).insertContent([linkContent(props), { type: "text", text: " " }]).run();
          },
          render: () => renderSlashMenu<PageItem>("Páginas"),
        }),
      ];
    },
  });
}

/** `[[` abre a lista de páginas para linkar. */
export const WikiLink = pageSuggestion("wikiLink", "[[");
/** `@` faz o mesmo (menção de página). */
export const PageMention = pageSuggestion("pageMention", "@");
