import { TITLE_KEY, type DatabaseProps, type DatabaseRow, type TableView as TableViewDef } from "@asa/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CellEditor } from "./CellEditor.js";
import { PROPERTY_LABELS, removeProperty, setViewSort, sortRows, updateProperty } from "./db-model.js";
import { PropertyMenu } from "./PropertyMenu.js";

interface Props {
  props: DatabaseProps;
  view: TableViewDef;
  rows: DatabaseRow[];
  onSchemaChange: (next: DatabaseProps) => void;
  onAddProperty: () => void;
  onCellChange: (row: DatabaseRow, key: string, value: unknown) => void;
  onTitleChange: (row: DatabaseRow, title: string) => void;
  onAddRow: () => void;
  onDeleteRow: (row: DatabaseRow) => void;
  onOpenRow: (id: string) => void;
}

function TitleCell({ row, onCommit }: { row: DatabaseRow; onCommit: (title: string) => void }) {
  const [draft, setDraft] = useState(row.title);
  useEffect(() => setDraft(row.title), [row.title]);
  return (
    <input
      className="cell-input cell-title"
      aria-label="Nome"
      placeholder="Sem título"
      value={draft}
      maxLength={500}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== row.title && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(row.title);
      }}
    />
  );
}

export function TableView(p: Props) {
  const { props, view, rows } = p;
  const [menu, setMenu] = useState<{ key: string; top: number; left: number } | null>(null);
  const menuKey = menu?.key ?? null;
  const closeMenu = useCallback(() => setMenu(null), []);
  const sorted = useMemo(() => sortRows(rows, view.sort, props.schema), [rows, view.sort, props.schema]);

  const columns = view.columns.filter(
    (c) => c.key === TITLE_KEY || props.schema.properties.some((prop) => prop.key === c.key),
  );
  const sortOf = (key: string) => view.sort.find((s) => s.key === key)?.direction ?? null;

  return (
    <div className="table-wrap">
      <table className="db-table">
        <thead>
          <tr>
            {columns.map((column) => {
              const property = props.schema.properties.find((prop) => prop.key === column.key) ?? null;
              const label = property ? property.name : "Nome";
              const direction = sortOf(column.key);
              return (
                <th key={column.key} style={{ width: column.width ?? (column.key === TITLE_KEY ? 260 : 180) }}>
                  <button
                    type="button"
                    className="th-button"
                    title={property ? PROPERTY_LABELS[property.type] : "Título"}
                    onClick={(e) => {
                      if (menuKey === column.key) return setMenu(null);
                      const rect = e.currentTarget.getBoundingClientRect();
                      setMenu({ key: column.key, top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - 296)) });
                    }}
                  >
                    {label}
                    {direction && <span className="sort-mark">{direction === "asc" ? " ↑" : " ↓"}</span>}
                  </button>
                  {menuKey === column.key && (
                    <PropertyMenu
                      property={property}
                      sort={direction}
                      position={{ top: menu!.top, left: menu!.left }}
                      onClose={closeMenu}
                      onSort={(dir) =>
                        p.onSchemaChange(setViewSort(props, view.id, dir ? [{ key: column.key, direction: dir }] : []))
                      }
                      onRename={(name) => p.onSchemaChange(updateProperty(props, column.key, { name }))}
                      onChangeType={(type) => p.onSchemaChange(updateProperty(props, column.key, { type }))}
                      onChangeOptions={(options) => p.onSchemaChange(updateProperty(props, column.key, { options }))}
                      onDelete={() => {
                        setMenu(null);
                        if (window.confirm(`Apagar a propriedade "${label}"?`)) {
                          p.onSchemaChange(removeProperty(props, column.key));
                        }
                      }}
                    />
                  )}
                </th>
              );
            })}
            <th className="th-add">
              <button type="button" className="icon" aria-label="Nova propriedade" title="Nova propriedade" onClick={p.onAddProperty}>
                +
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => {
                if (column.key === TITLE_KEY) {
                  return (
                    <td key={column.key} className="td-title">
                      <TitleCell row={row} onCommit={(title) => p.onTitleChange(row, title)} />
                      <button type="button" className="icon open-row" aria-label="Abrir" title="Abrir como página" onClick={() => p.onOpenRow(row.id)}>
                        ↗
                      </button>
                    </td>
                  );
                }
                const property = props.schema.properties.find((prop) => prop.key === column.key)!;
                return (
                  <td key={column.key}>
                    <CellEditor property={property} value={row.props[column.key]} onChange={(value) => p.onCellChange(row, column.key, value)} />
                  </td>
                );
              })}
              <td className="td-actions">
                <button type="button" className="icon" aria-label="Apagar linha" title="Apagar linha" onClick={() => p.onDeleteRow(row)}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="ghost add-row" onClick={p.onAddRow}>
        + Nova
      </button>
    </div>
  );
}
