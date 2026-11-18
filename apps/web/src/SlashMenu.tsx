import { useEffect, useRef } from "react";
import type { SlashItem } from "./slash-items";

interface SlashMenuProps {
  items: SlashItem[];
  selected: number;
  onPick: (item: SlashItem) => void;
  onHover: (index: number) => void;
}

export function SlashMenu({ items, selected, onPick, onHover }: SlashMenuProps) {
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
    <div ref={list} className="menu slash-menu-box" role="listbox" aria-label="Blocos">
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
              <span className="trunc subtle" style={{ fontSize: 11, lineHeight: "14px", maxWidth: "100%" }}>{item.description}</span>
            </span>
            {item.shortcut && <span className="k">{item.shortcut}</span>}
          </button>
        </div>
      ))}
    </div>
  );
}
