import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { pagesApi } from "./api";
import { COLOR_BADGE, type Option, type Property, type PropValue, type Row } from "./db-types";
import { displayTitle } from "./pages-tree";
import { useDismiss } from "./use-dismiss";

export function OptionBadge({ option }: { option: Option }) {
  return <span className={COLOR_BADGE[option.color ?? "gray"] ?? "badge"} style={{ height: 20 }}>{option.name}</span>;
}

/** Linhas de uma database, para mostrar e escolher relações. */
function useRows(databaseId: string | null): Row[] | null {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    if (!databaseId) return setRows([]);
    let live = true;
    pagesApi.rows(databaseId).then((r) => live && setRows(r)).catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [databaseId]);
  return rows;
}

/**
 * Menu flutuante preso a um elemento. Vai para o body (não é cortado pela tabela) e abre para cima
 * quando falta espaço embaixo. Herda o tema do app.
 */
export function Popover({ anchor, onClose, children, width = 240 }: { anchor: RefObject<HTMLElement | null>; onClose: () => void; children: React.ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useDismiss(ref, true, onClose);

  useLayoutEffect(() => {
    const el = anchor.current;
    const box = ref.current;
    if (!el || !box) return;
    const rect = el.getBoundingClientRect();
    const height = box.offsetHeight;
    const below = rect.bottom + 4 + height <= window.innerHeight - 8;
    setPos({ top: below ? rect.bottom + 4 : Math.max(8, rect.top - height - 4), left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) });
  }, [anchor, width, children]);

  // Rolar a página fecha o menu: a posição calculada deixaria de valer.
  useEffect(() => {
    const close = (e: Event) => !ref.current?.contains(e.target as Node) && onClose();
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [onClose]);

  const dark = !!document.querySelector(".ds.escuro");
  return createPortal(
    <div className={`ds${dark ? " escuro" : ""}`} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 80, background: "transparent" }}>
      <div ref={ref} className="menu on" style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999, width, maxHeight: "min(420px, calc(100vh - 16px))", overflow: "auto", pointerEvents: "auto", visibility: pos ? "visible" : "hidden" }}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

interface EditorProps {
  prop: Property;
  value: PropValue;
  onChange: (value: PropValue) => void;
  /** Versão compacta para células de tabela (sem borda). */
  cell?: boolean;
}

const bare = { border: 0, background: "transparent", color: "inherit", font: "inherit", outline: "none", width: "100%", height: "100%", padding: "0 10px", minHeight: 34 } as const;

function TextEditor({ prop, value, onChange, cell }: EditorProps) {
  const initial = value === undefined || value === null ? "" : String(value);
  const [draft, setDraft] = useState(initial);
  useEffect(() => setDraft(initial), [initial]);
  const numeric = prop.type === "number";
  const commit = () => {
    if (draft === initial) return;
    if (draft.trim() === "") return onChange(null);
    if (numeric) {
      const n = Number(draft.replace(",", "."));
      if (Number.isFinite(n)) onChange(n);
      else setDraft(initial);
      return;
    }
    if (prop.type === "url" && !/^https?:\/\//i.test(draft.trim())) {
      // Aceita "site.com" colocando https:// na frente.
      return onChange(`https://${draft.trim()}`);
    }
    onChange(draft);
  };
  return (
    <input
      className={cell ? undefined : "inp"}
      style={cell ? bare : undefined}
      type={numeric ? "text" : "text"}
      inputMode={numeric ? "decimal" : prop.type === "url" ? "url" : undefined}
      aria-label={prop.name}
      value={draft}
      placeholder={cell ? "" : "Vazio"}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape") {
          setDraft(initial);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function SelectEditor({ prop, value, onChange, cell }: EditorProps) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const current = prop.options.find((o) => o.id === value);
  return (
    <div ref={anchor} style={{ height: "100%" }}>
      <button className="plain" type="button" aria-label={prop.name} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)} style={{ ...(cell ? bare : { minHeight: 32, padding: "0 8px" }), display: "flex", alignItems: "center", cursor: "pointer", textAlign: "left" }}>
        {current ? <OptionBadge option={current} /> : <span style={{ color: "var(--text-3)" }}>Vazio</span>}
      </button>
      {open && (
        <Popover anchor={anchor} onClose={() => setOpen(false)}>
          <div role="listbox" aria-label={prop.name}>
            {prop.options.map((o) => (
              <button key={o.id} className={`plain mrow${o.id === value ? " sel" : ""}`} type="button" role="option" aria-selected={o.id === value} onClick={() => { onChange(o.id); setOpen(false); }}>
                <OptionBadge option={o} />
              </button>
            ))}
            {prop.options.length === 0 && <div className="mrow dis">Sem opções. Edite a propriedade para criar.</div>}
            {current && <button className="plain mrow" type="button" onClick={() => { onChange(null); setOpen(false); }}>Limpar</button>}
          </div>
        </Popover>
      )}
    </div>
  );
}

function MultiEditor({ prop, value, onChange, cell }: EditorProps) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const ids = Array.isArray(value) ? value : [];
  const chosen = prop.options.filter((o) => ids.includes(o.id));
  const toggle = (id: string) => {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    onChange(next.length === 0 ? null : next);
  };
  return (
    <div ref={anchor} style={{ height: "100%" }}>
      <button className="plain" type="button" aria-label={prop.name} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)} style={{ ...(cell ? bare : { minHeight: 32, padding: "0 8px" }), display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", cursor: "pointer", textAlign: "left" }}>
        {chosen.length > 0 ? chosen.map((o) => <OptionBadge key={o.id} option={o} />) : <span style={{ color: "var(--text-3)" }}>Vazio</span>}
      </button>
      {open && (
        <Popover anchor={anchor} onClose={() => setOpen(false)}>
          {prop.options.map((o) => (
            <button key={o.id} className="plain mrow" type="button" role="checkbox" aria-checked={ids.includes(o.id)} onClick={() => toggle(o.id)}>
              <span className={`cb${ids.includes(o.id) ? " on" : ""}`} style={{ width: 16, height: 16 }}><svg className="ico tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" pathLength="1" /></svg></span>
              <OptionBadge option={o} />
            </button>
          ))}
          {prop.options.length === 0 && <div className="mrow dis">Sem opções. Edite a propriedade para criar.</div>}
        </Popover>
      )}
    </div>
  );
}

function RelationEditor({ prop, value, onChange, cell }: EditorProps) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const rows = useRows(prop.relationDb);
  const ids = Array.isArray(value) ? value : [];
  const titleOf = (id: string) => displayTitle(rows?.find((r) => r.id === id)?.title ?? "");
  const toggle = (id: string) => {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    onChange(next.length === 0 ? null : next);
  };
  return (
    <div ref={anchor} style={{ height: "100%" }}>
      <button className="plain" type="button" aria-label={prop.name} aria-expanded={open} onClick={() => setOpen((v) => !v)} style={{ ...(cell ? bare : { minHeight: 32, padding: "0 8px" }), display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", cursor: "pointer", textAlign: "left" }}>
        {ids.length > 0 && rows ? ids.map((id) => <span key={id} className="mention">{titleOf(id)}</span>) : <span style={{ color: "var(--text-3)" }}>Vazio</span>}
      </button>
      {open && (
        <Popover anchor={anchor} onClose={() => setOpen(false)} width={260}>
          {rows === null && <div className="mrow dis">Carregando…</div>}
          {rows?.length === 0 && <div className="mrow dis">Sem linhas na database ligada.</div>}
          <div style={{ maxHeight: 240, overflow: "auto" }}>
            {rows?.map((r) => (
              <button key={r.id} className="plain mrow" type="button" role="checkbox" aria-checked={ids.includes(r.id)} onClick={() => toggle(r.id)}>
                <span className={`cb${ids.includes(r.id) ? " on" : ""}`} style={{ width: 16, height: 16 }}><svg className="ico tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" pathLength="1" /></svg></span>
                <span className="trunc">{displayTitle(r.title)}</span>
              </button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}

/** Editor de uma propriedade, do tipo certo. Serve para a célula da tabela e para o painel da linha. */
export function PropEditor(props: EditorProps) {
  const { prop, value, onChange, cell } = props;
  switch (prop.type) {
    case "checkbox":
      return (
        <button className="plain" type="button" role="checkbox" aria-checked={value === true} aria-label={prop.name} onClick={() => onChange(value === true ? null : true)} style={{ display: "flex", alignItems: "center", padding: cell ? "0 10px" : "0 8px", minHeight: cell ? 34 : 32, cursor: "pointer" }}>
          <span className={`cb${value === true ? " on" : ""}`}><svg className="ico tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" pathLength="1" /></svg></span>
        </button>
      );
    case "date":
      return <input className={cell ? undefined : "inp"} style={cell ? { ...bare, colorScheme: document.querySelector(".ds.escuro") ? "dark" : "light" } : undefined} type="date" aria-label={prop.name} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} />;
    case "select":
    case "status":
      return <SelectEditor {...props} />;
    case "multiselect":
      return <MultiEditor {...props} />;
    case "relation":
      return <RelationEditor {...props} />;
    default:
      return <TextEditor {...props} />;
  }
}

/** Valor só para leitura (cartões, lista, calendário). */
export function ValueView({ prop, value }: { prop: Property; value: PropValue }) {
  const rows = useRows(prop.type === "relation" ? prop.relationDb : null);
  if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) return null;
  if (prop.type === "select" || prop.type === "status") {
    const o = prop.options.find((x) => x.id === value);
    return o ? <OptionBadge option={o} /> : null;
  }
  if (prop.type === "multiselect") return <>{prop.options.filter((o) => Array.isArray(value) && value.includes(o.id)).map((o) => <OptionBadge key={o.id} option={o} />)}</>;
  if (prop.type === "checkbox") return value === true ? <span className="badge ok" style={{ height: 20 }}>{prop.name}</span> : null;
  if (prop.type === "date") return <span className="mono" style={{ fontSize: 12 }}>{String(value).split("-").reverse().join("/")}</span>;
  if (prop.type === "url") return <a href={String(value)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>{String(value).replace(/^https?:\/\//, "")}</a>;
  if (prop.type === "relation") return <>{(Array.isArray(value) ? value : []).map((id) => <span key={id} className="mention">{displayTitle(rows?.find((r) => r.id === id)?.title ?? "…")}</span>)}</>;
  return <span style={{ fontSize: 13 }}>{String(value)}</span>;
}
