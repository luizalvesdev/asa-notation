import { useRef, useState } from "react";
import { Popover } from "./db-cells";
import { Icon } from "./icons";
import { TEMPLATES } from "./templates";
import { Presence } from "./Presence";

interface NewMenuProps {
  onCreate: (extra: { title?: string; body?: unknown; icon?: string; kind?: "page" | "database" | "canvas" }) => void;
}

/** Menu ao lado do "+" da barra lateral: database e modelos de página. */
export function NewMenu({ onCreate }: NewMenuProps) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const pick = (extra: Parameters<NewMenuProps["onCreate"]>[0]) => {
    setOpen(false);
    onCreate(extra);
  };
  return (
    <span ref={anchor} style={{ display: "inline-flex" }}>
      <button className="btn btn-fan btn-ico btn-sm" type="button" aria-label="Novo a partir de modelo" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} style={{ width: 22, height: 22 }}>
        <Icon name="more" />
      </button>
      <Presence show={open}><Popover anchor={anchor} onClose={() => setOpen(false)} width={270}>
          <div role="menu" aria-label="Novo">
            <div className="mgroup">Em branco</div>
            <button className="plain mrow" type="button" role="menuitem" onClick={() => pick({})}>
              <Icon name="doc" />
              <span className="grow1">Página</span>
            </button>
            <button className="plain mrow two" type="button" role="menuitem" onClick={() => pick({ kind: "database", title: "Database", icon: "🗂️" })}>
              <Icon name="table" />
              <span className="col grow1" style={{ alignItems: "flex-start", gap: 0 }}>
                <span>Database</span>
                <span className="subtle" style={{ fontSize: "calc(11px * var(--fs, 1))" }}>Tabela, kanban, lista e calendário</span>
              </span>
            </button>
            <button className="plain mrow two" type="button" role="menuitem" onClick={() => pick({ kind: "canvas", title: "Quadro", icon: "🎨" })}>
              <Icon name="canvas" />
              <span className="col grow1" style={{ alignItems: "flex-start", gap: 0 }}>
                <span>Quadro</span>
                <span className="subtle" style={{ fontSize: "calc(11px * var(--fs, 1))" }}>Desenho livre com formas e texto</span>
              </span>
            </button>
            <div className="mgroup">Modelos</div>
            {TEMPLATES.map((t) => (
              <button key={t.id} className="plain mrow two" type="button" role="menuitem" onClick={() => pick({ title: t.pageTitle, body: t.body, icon: t.icon })}>
                <span className="page-emoji" aria-hidden="true">{t.icon}</span>
                <span className="col grow1" style={{ alignItems: "flex-start", gap: 0 }}>
                  <span>{t.title}</span>
                  <span className="subtle" style={{ fontSize: "calc(11px * var(--fs, 1))" }}>{t.description}</span>
                </span>
              </button>
            ))}
          </div>
        </Popover></Presence>
    </span>
  );
}
