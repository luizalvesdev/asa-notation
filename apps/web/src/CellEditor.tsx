import type { PropertyDef, SelectOption } from "@asa/core";
import { useEffect, useState } from "react";
import { cellValue } from "./db-model.js";

interface Props {
  property: PropertyDef;
  value: unknown;
  onChange: (value: unknown) => void;
}

export function Tag({ option, onRemove }: { option: SelectOption; onRemove?: () => void }) {
  return (
    <span className={`tag color-${option.color}`}>
      {option.name}
      {onRemove && (
        <button type="button" className="tag-remove" aria-label={`Remover ${option.name}`} onClick={onRemove}>
          ×
        </button>
      )}
    </span>
  );
}

function TextCell({ property, value, onChange }: Props & { value: string | number | null }) {
  const shown = value === null ? "" : String(value);
  const [draft, setDraft] = useState(shown);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(shown);
    setInvalid(false);
  }, [shown]);

  const commit = () => {
    const text = draft.trim();
    if (text === shown.trim()) return;
    if (text === "") return onChange(null);
    if (property.type === "number") {
      const parsed = Number(text.replace(",", "."));
      if (!Number.isFinite(parsed)) return setInvalid(true);
      return onChange(parsed);
    }
    if (property.type === "url" && !/^https?:\/\/\S+$/i.test(text)) return setInvalid(true);
    onChange(property.type === "text" ? draft : text);
  };

  return (
    <input
      className={invalid ? "cell-input invalid" : "cell-input"}
      aria-label={property.name}
      inputMode={property.type === "number" ? "decimal" : undefined}
      value={draft}
      title={invalid ? (property.type === "url" ? "Use um endereço http(s)://" : "Número inválido") : undefined}
      onChange={(e) => {
        setDraft(e.target.value);
        setInvalid(false);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(shown);
          setInvalid(false);
        }
      }}
    />
  );
}

export function CellEditor({ property, value, onChange }: Props) {
  const current = cellValue(property, value);
  const options = property.options ?? [];

  switch (property.type) {
    case "checkbox":
      return (
        <input
          type="checkbox"
          className="cell-check"
          aria-label={property.name}
          checked={current === true}
          onChange={(e) => onChange(e.target.checked ? true : null)}
        />
      );
    case "date":
      return (
        <input
          type="date"
          className="cell-input"
          aria-label={property.name}
          value={(current as string | null) ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        />
      );
    case "select": {
      const selected = options.find((o) => o.id === current);
      return (
        <select
          className={`cell-input cell-select${selected ? ` color-${selected.color}` : ""}`}
          aria-label={property.name}
          value={(current as string | null) ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      );
    }
    case "multi_select": {
      const values = (current as string[] | null) ?? [];
      const remaining = options.filter((o) => !values.includes(o.id));
      return (
        <div className="cell-multi">
          {values.map((id) => {
            const option = options.find((o) => o.id === id)!;
            return (
              <Tag
                key={id}
                option={option}
                onRemove={() => {
                  const next = values.filter((v) => v !== id);
                  onChange(next.length > 0 ? next : null);
                }}
              />
            );
          })}
          {remaining.length > 0 && (
            <select
              className="cell-add"
              aria-label={`Adicionar em ${property.name}`}
              value=""
              onChange={(e) => e.target.value && onChange([...values, e.target.value])}
            >
              <option value="">+</option>
              {remaining.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
        </div>
      );
    }
    default:
      return <TextCell property={property} value={current as string | number | null} onChange={onChange} />;
  }
}
