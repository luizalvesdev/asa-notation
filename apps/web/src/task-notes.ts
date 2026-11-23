import { Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

/**
 * Anotação de um checkbox. O texto fica no atributo `note` do item. Cada item ganha um botão:
 * com nota escrita ele fica sempre visível e colorido; passar o mouse mostra a nota; clicar abre a edição.
 */

export const MAX_NOTE = 2000;

/** Texto de nota pronto para guardar: sem espaço sobrando nas pontas e no limite. */
export function normalizeNote(raw: string): string {
  return raw.replace(/\r\n/g, "\n").trim().slice(0, MAX_NOTE);
}

export interface NoteHover {
  /** Posição do item no documento. */
  pos: number;
  rect: DOMRect;
  note: string;
}

interface Options {
  onHover: (info: NoteHover | null) => void;
  onOpen: (pos: number) => void;
}

const ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h14v12l-5 5H5z"/><path d="M14 21v-5h5"/><path d="M8 9h8M8 13h4"/></svg>';

/** Posição do item de tarefa a partir do botão (que fica dentro do primeiro parágrafo dele). */
function itemPos(view: EditorView, at: number): number {
  const $at = view.state.doc.resolve(at);
  return $at.before($at.depth - 1);
}

export function noteOf(view: EditorView, pos: number): { note: string; title: string } | null {
  const node = view.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "taskItem") return null;
  return { note: typeof node.attrs.note === "string" ? node.attrs.note : "", title: node.firstChild?.textContent ?? "" };
}

/** Grava a nota no item (vazia = remove). */
export function setNote(view: EditorView, pos: number, note: string) {
  const node = view.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "taskItem") return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, note: normalizeNote(note) }));
}

export const TaskNotes = Extension.create<Options>({
  name: "taskNotes",

  addOptions() {
    return { onHover: () => undefined, onOpen: () => undefined };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin({
        key: new PluginKey("taskNotes"),
        props: {
          decorations: (state) => {
            const decos: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name !== "taskItem" || !node.firstChild || node.firstChild.type.name !== "paragraph") return;
              const note = typeof node.attrs.note === "string" ? node.attrs.note : "";
              decos.push(
                Decoration.widget(
                  pos + 1 + node.firstChild.nodeSize - 1,
                  (view, getPos) => {
                    const btn = document.createElement("button");
                    btn.type = "button";
                    btn.className = `task-note-btn${note ? " has-note" : ""}`;
                    btn.contentEditable = "false";
                    btn.title = note ? "" : "Anotar nesta aula";
                    btn.setAttribute("aria-label", note ? "Ver ou editar a anotação desta aula" : "Anotar nesta aula");
                    btn.innerHTML = ICON;
                    // Mantém o cursor do editor onde estava.
                    btn.addEventListener("mousedown", (e) => e.preventDefault());
                    btn.addEventListener("pointerenter", () => {
                      const at = getPos();
                      if (at === undefined || !note) return;
                      options.onHover({ pos: itemPos(view, at), rect: btn.getBoundingClientRect(), note });
                    });
                    btn.addEventListener("pointerleave", () => options.onHover(null));
                    btn.addEventListener("click", () => {
                      const at = getPos();
                      if (at !== undefined) options.onOpen(itemPos(view, at));
                    });
                    return btn;
                  },
                  // A chave inclui o texto: mudou a nota, o botão é refeito com o estado novo.
                  { side: 1, key: `note-${note}`, ignoreSelection: true },
                ),
              );
            });
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});
