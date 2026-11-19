import { useEffect, useRef } from "react";
export interface MenuItem {
  id: string;
  group: string;
  title: string;
  description: string;
  shortcut?: string;
}

interface SlashMenuProps<T extends MenuItem> {
  items: T[];
  selected: number;
  label?: string;
  onPick: (item: T) => void;
  onHover: (index: number) => void;
}

export function SlashMenu<T extends MenuItem>({ items, selected, label = "Blocos", onPick, onHover }: SlashMenuProps<T>) {
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (items.length === 0) {
    return (
      <div className="menu slash-menu-box" role="status">
        <div className="mrow dis">Nada encontrado</div>
      </div>
    );
  }

  return (
    <div ref={list} className="menu slash-menu-box" role="listbox" aria-label={label}>
      {items.map((item, index) => (
        <div key={item.id} style={{ display: "contents" }}>
          {item.group !== items[index - 1]?.group && <div className="mgroup">{item.group}</div>}
          <button
            type="button"
            role="option"
            aria-selected={index === selected}
            className={`plain mrow${index === selected ? " sel" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => onHover(index)}
            onClick={() => onPick(item)}
          >
            <span className="col grow1" style={{ alignItems: "flex-start", gap: 0, minWidth: 0 }}>
              <span className="trunc" style={{ maxWidth: "100%" }}>{item.title}</span>
              <span className="trunc subtle" style={{ fontSize: "calc(11px * var(--fs, 1))", lineHeight: "calc(14px * var(--fs, 1))", maxWidth: "100%" }}>{item.description}</span>
            </span>
            {item.shortcut && <span className="k">{item.shortcut}</span>}
          </button>
        </div>
      ))}
    </div>
  );
}
