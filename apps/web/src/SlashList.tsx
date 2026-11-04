import { useEffect, useRef } from "react";
import type { SlashItem } from "./slash-items.js";

interface Props {
  items: SlashItem[];
  selected: number;
  onPick: (item: SlashItem) => void;
  onHover: (index: number) => void;
}

export function SlashList({ items, selected, onPick, onHover }: Props) {
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (items.length === 0) return <div className="slash-empty">Nada encontrado</div>;

  return (
    <div ref={list} role="listbox" aria-label="Blocos">
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={index === selected}
          className={index === selected ? "slash-item selected" : "slash-item"}
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => onHover(index)}
          onClick={() => onPick(item)}
        >
          <span className="slash-title">{item.title}</span>
          <span className="slash-desc">{item.description}</span>
        </button>
      ))}
    </div>
  );
}
