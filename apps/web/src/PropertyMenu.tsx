import { OPTION_COLORS, PROPERTY_TYPES, type OptionColor, type PropertyDef, type PropertyType, type SelectOption } from "@asa/core";
import { useEffect, useRef, useState } from "react";
import { newOption, PROPERTY_LABELS } from "./db-model.js";

interface Props {
  property: PropertyDef | null;
  sort: "asc" | "desc" | null;
  onSort: (direction: "asc" | "desc" | null) => void;
  onRename?: (name: string) => void;
  onChangeType?: (type: PropertyType) => void;
  onChangeOptions?: (options: SelectOption[]) => void;
  onDelete?: () => void;
  onClose: () => void;
  position: { top: number; left: number };
}

const COLOR_LABELS: Record<OptionColor, string> = {
  gray: "Cinza",
  brown: "Marrom",
  orange: "Laranja",
  yellow: "Amarelo",
  green: "Verde",
  blue: "Azul",
  purple: "Roxo",
  pink: "Rosa",
  red: "Vermelho",
};

export function PropertyMenu({ property, sort, onSort, onRename, onChangeType, onChangeOptions, onDelete, onClose, position }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(property?.name ?? "");

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const commitName = () => {
    const trimmed = name.trim();
    if (property && trimmed !== "" && trimmed !== property.name) onRename?.(trimmed.slice(0, 100));
    else setName(property?.name ?? "");
  };

  const options = property?.options ?? [];
  const editOption = (id: string, changes: Partial<SelectOption>) =>
    onChangeOptions?.(options.map((o) => (o.id === id ? { ...o, ...changes } : o)));

  return (
    <div className="menu" ref={ref} role="dialog" aria-label="Propriedade" style={position}>
      {property && (
        <>
          <input
            className="menu-input"
            aria-label="Nome da propriedade"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
          <label className="menu-row">
            Tipo
            <select value={property.type} onChange={(e) => onChangeType?.(e.target.value as PropertyType)}>
              {PROPERTY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {PROPERTY_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          {(property.type === "select" || property.type === "multi_select") && (
            <div className="menu-options">
              <div className="menu-label">Opções</div>
              {options.map((option) => (
                <div className="menu-option" key={option.id}>
                  <input
                    aria-label="Nome da opção"
                    defaultValue={option.name}
                    maxLength={100}
                    onBlur={(e) => {
                      const value = e.target.value.trim();
                      if (value !== "" && value !== option.name) editOption(option.id, { name: value });
                      else e.target.value = option.name;
                    }}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  />
                  <select
                    aria-label="Cor"
                    className={`color-${option.color}`}
                    value={option.color}
                    onChange={(e) => editOption(option.id, { color: e.target.value as OptionColor })}
                  >
                    {OPTION_COLORS.map((color) => (
                      <option key={color} value={color}>
                        {COLOR_LABELS[color]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="icon"
                    aria-label={`Apagar opção ${option.name}`}
                    onClick={() => onChangeOptions?.(options.filter((o) => o.id !== option.id))}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button type="button" className="ghost" onClick={() => onChangeOptions?.([...options, newOption(options)])}>
                + Opção
              </button>
            </div>
          )}
        </>
      )}
      <div className="menu-label">Ordenar</div>
      <div className="menu-sort">
        <button type="button" className={sort === "asc" ? "chip active" : "chip"} onClick={() => onSort("asc")}>
          Crescente
        </button>
        <button type="button" className={sort === "desc" ? "chip active" : "chip"} onClick={() => onSort("desc")}>
          Decrescente
        </button>
        {sort && (
          <button type="button" className="chip" onClick={() => onSort(null)}>
            Sem ordem
          </button>
        )}
      </div>
      {property && onDelete && (
        <button type="button" className="ghost danger" onClick={onDelete}>
          Apagar propriedade
        </button>
      )}
    </div>
  );
}
