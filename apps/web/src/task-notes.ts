import { Extension } from "@tiptap/react";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Node as PMNode, ResolvedPos } from "@tiptap/pm/model";

/**
 * Anotação dentro de um checkbox: o que vem depois do primeiro parágrafo de um item de tarefa é a nota dele.
 * Cada item ganha um botão que abre (ou cria) a nota; com nota escrita, o botão fica sempre visível e colorido.
 */

/** Estado da nota de um item de tarefa: se existe o bloco e se tem texto. */
export function taskNoteState(item: { childCount: number; child(i: number): { textContent: string } }): { exists: boolean; filled: boolean } {
  let filled = false;
  for (let i = 1; i < item.childCount; i++) if (item.child(i).textContent.trim() !== "") filled = true;
  return { exists: item.childCount > 1, filled };
}

/** Parágrafo de nota: filho de um item de tarefa, depois do título. */
function inNote($pos: ResolvedPos): boolean {
  const d = $pos.depth;
  return d >= 1 && $pos.parent.type.name === "paragraph" && $pos.node(d - 1).type.name === "taskItem" && $pos.index(d - 1) >= 1;
}

const ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h14v12l-5 5H5z"/><path d="M14 21v-5h5"/><path d="M8 9h8M8 13h4"/></svg>';

/** Foca a nota do item (criando um parágrafo vazio se ainda não há). */
function openNote(view: EditorView, itemPos: number) {
  const { state } = view;
  const item = state.doc.nodeAt(itemPos);
  if (!item || item.type.name !== "taskItem" || !item.firstChild) return;
  const second = itemPos + 1 + item.firstChild.nodeSize;
  let tr = state.tr;
  let caret: number;
  if (item.childCount > 1) {
    caret = second + item.child(1).nodeSize - 1;
  } else {
    tr = tr.insert(second, state.schema.nodes.paragraph!.create());
    caret = second + 1;
  }
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, caret)).scrollIntoView());
  view.focus();
}

const key = new PluginKey("taskNotes");

export const TaskNotes = Extension.create({
  name: "taskNotes",
  // Antes do Enter e do Backspace dos itens de lista.
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      // Na nota, Enter quebra a linha (em vez de criar outro item).
      Enter: ({ editor }) => (inNote(editor.state.selection.$from) ? editor.commands.setHardBreak() : false),
      // Nota vazia: Backspace apaga o bloco e volta ao título. Com texto, Backspace no começo não funde a nota com o título.
      Backspace: ({ editor }) => {
        const { selection, tr } = editor.state;
        const { $from } = selection;
        if (!selection.empty || !inNote($from) || $from.parentOffset !== 0) return false;
        if ($from.parent.content.size > 0) return true;
        const itemStart = $from.start($from.depth - 1);
        const first = $from.node($from.depth - 1).firstChild!;
        const titleEnd = itemStart + first.nodeSize - 1;
        const next = tr.delete($from.before(), $from.after());
        // A nota vem depois do título, então a posição do fim do título não muda.
        editor.view.dispatch(next.setSelection(TextSelection.create(next.doc, titleEnd)).scrollIntoView());
        return true;
      },
      // Esc na nota volta ao título do item.
      Escape: ({ editor }) => {
        const { $from } = editor.state.selection;
        if (!inNote($from)) return false;
        const first = $from.node($from.depth - 1).firstChild!;
        editor.commands.setTextSelection($from.start($from.depth - 1) + first.nodeSize - 1);
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        props: {
          decorations: (state) => {
            const decos: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name !== "taskItem" || !node.firstChild || node.firstChild.type.name !== "paragraph") return;
              const { exists, filled } = taskNoteState(node);
              const first = node.firstChild;
              decos.push(
                Decoration.widget(
                  pos + 1 + first.nodeSize - 1,
                  (view, getPos) => {
                    const btn = document.createElement("button");
                    btn.type = "button";
                    btn.className = `task-note-btn${filled ? " has-note" : ""}`;
                    btn.contentEditable = "false";
                    btn.title = filled ? "Ver a anotação desta aula" : "Anotar nesta aula";
                    btn.setAttribute("aria-label", btn.title);
                    btn.innerHTML = ICON;
                    // Mantém o foco do editor: o clique não tira o cursor de onde estava.
                    btn.addEventListener("mousedown", (e) => e.preventDefault());
                    btn.addEventListener("click", () => {
                      const at = getPos();
                      if (at === undefined) return;
                      // O botão fica dentro do primeiro parágrafo; o item de tarefa é o nó acima dele.
                      const $at = view.state.doc.resolve(at);
                      openNote(view, $at.before($at.depth - 1));
                    });
                    return btn;
                  },
                  { side: 1, key: `note-${filled ? 1 : 0}-${exists ? 1 : 0}`, ignoreSelection: true },
                ),
              );
              // Os parágrafos de nota ganham uma marca para o CSS (e o aviso de vazio).
              let offset = pos + 1 + first.nodeSize;
              for (let i = 1; i < node.childCount; i++) {
                const child = node.child(i);
                if (child.type.name === "paragraph") {
                  decos.push(Decoration.node(offset, offset + child.nodeSize, { class: `task-note${child.content.size === 0 ? " task-note-empty" : ""}` }));
                }
                offset += child.nodeSize;
              }
            });
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});
