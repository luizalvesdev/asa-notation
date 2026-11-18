import { Extension } from "@tiptap/react";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import { createRoot, type Root } from "react-dom/client";
import { SlashMenu, type MenuItem } from "./SlashMenu";
import { filterSlashItems, type SlashItem } from "./slash-items";

/** Menu flutuante de sugestões (blocos, páginas). Posiciona-se junto ao cursor e responde ao teclado. */
export function renderSlashMenu<T extends MenuItem>(label = "Blocos") {
  type Props = SuggestionProps<T, T>;
  let root: Root | null = null;
  let unmount: (() => void) | null = null;
  let current: Props | null = null;
  let selected = 0;
  let lastQuery = "";

  const draw = () => {
    if (!root || !current) return;
    const props = current;
    root.render(
      <SlashMenu
        items={props.items}
        label={label}
        selected={selected}
        onPick={(item) => props.command(item)}
        onHover={(index) => {
          selected = index;
          draw();
        }}
      />,
    );
  };

  return {
    onStart(props: Props) {
      current = props;
      selected = 0;
      lastQuery = props.query;
      const container = document.createElement("div");
      // O menu vive em document.body, fora do tema: ganha as classes do tema para herdar as cores.
      container.className = `ds slash-menu${document.querySelector(".ds.escuro") ? " escuro" : ""}`;
      root = createRoot(container);
      unmount = props.mount(container);
      draw();
    },
    onUpdate(props: Props) {
      current = props;
      if (props.query !== lastQuery) {
        lastQuery = props.query;
        selected = 0;
      }
      selected = Math.min(selected, Math.max(props.items.length - 1, 0));
      draw();
    },
    onKeyDown({ event }: SuggestionKeyDownProps): boolean {
      const items = current?.items ?? [];
      if (items.length === 0) return false;
      if (event.key === "ArrowDown") {
        selected = (selected + 1) % items.length;
        draw();
        return true;
      }
      if (event.key === "ArrowUp") {
        selected = (selected - 1 + items.length) % items.length;
        draw();
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const item = items[selected];
        if (item && current) current.command(item);
        return true;
      }
      return false;
    },
    onExit() {
      unmount?.();
      const closing = root;
      root = null;
      current = null;
      if (closing) queueMicrotask(() => closing.unmount());
    },
  };
}

export const SlashCommand = Extension.create({
  name: "slashCommand",

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: "/",
        allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
        items: ({ query }) => filterSlashItems(query),
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).run();
          props.run(editor);
        },
        render: renderSlashMenu,
      }),
    ];
  },
});
