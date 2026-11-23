import { useState } from "react";
import { pageHash } from "./nav";
import { Reveal } from "./Reveal";
import type { OutlineGroup, OutlineItem } from "./goals-types";

const small = { fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-2)", whiteSpace: "nowrap" } as const;

function Tick({ on }: { on: boolean }) {
  return (
    <span className={`cb${on ? " on" : ""}`} aria-hidden="true">
      <svg className="ico tick" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7" pathLength="1" /></svg>
    </span>
  );
}

function Chev({ open }: { open: boolean }) {
  return (
    <svg className={`chev${open ? " on" : ""}`} viewBox="0 0 24 24" aria-hidden="true" style={{ width: 16, height: 16, flex: "none", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" }}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

const pct = (done: number, total: number) => (total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100)));

function Item({ item, open, onToggle, openSections, onToggleSection, keyBase }: { item: OutlineItem; open: boolean; onToggle: () => void; openSections: ReadonlySet<string>; onToggleSection: (key: string) => void; keyBase: string }) {
  const finished = item.total > 0 && item.done >= item.total;
  // Item sem página própria é uma caixinha só (curso ainda não salvo com as aulas).
  if (item.sections.length === 0) {
    return (
      <div className="row" style={{ gap: 10, padding: "6px 4px 6px 26px", minHeight: 32 }}>
        <Tick on={finished} />
        <span className="grow1" style={{ fontSize: "calc(14px * var(--fs, 1))", overflowWrap: "anywhere", textDecoration: finished ? "line-through" : undefined, color: finished ? "var(--text-3)" : undefined }}>{item.title}</span>
        {item.pageId && <a href={pageHash(item.pageId)} style={small}>Abrir</a>}
      </div>
    );
  }
  return (
    <div className="col">
      <div className="row" style={{ gap: 6, minHeight: 36 }}>
        <button className="plain row grow1" type="button" aria-expanded={open} onClick={onToggle} style={{ gap: 8, padding: "6px 4px", textAlign: "left", minWidth: 0, cursor: "pointer" }}>
          <Chev open={open} />
          <span className="grow1" style={{ fontSize: "calc(14px * var(--fs, 1))", overflowWrap: "anywhere" }}>{item.title}</span>
          <span style={small}>{item.done} de {item.total}</span>
          <span className="bar" style={{ width: 64, flex: "none" }}><span style={{ width: `${pct(item.done, item.total)}%` }} /></span>
        </button>
        {item.pageId && <a href={pageHash(item.pageId)} style={small}>Abrir</a>}
      </div>
      <Reveal show={open}>
        <div className="col" style={{ gap: 2, paddingLeft: 22 }}>
          {item.sections.map((s, i) => {
            const key = `${keyBase}/${i}`;
            const sOpen = openSections.has(key);
            return (
              <div key={key} className="col">
                <button className="plain row" type="button" aria-expanded={sOpen} onClick={() => onToggleSection(key)} style={{ gap: 8, padding: "5px 4px", textAlign: "left", minWidth: 0, cursor: "pointer" }}>
                  <Chev open={sOpen} />
                  <span className="grow1" style={{ fontSize: "calc(13px * var(--fs, 1))", overflowWrap: "anywhere" }}>{s.title || "Aulas"}</span>
                  <span style={small}>{s.done} de {s.total}</span>
                </button>
                <Reveal show={sOpen}>
                  <div className="col" style={{ gap: 2, padding: "2px 0 6px 28px" }}>
                    {s.lessons.map((l, j) => (
                      <div key={j} className="col" style={{ gap: 2 }}>
                        <div className="row" style={{ gap: 10, minHeight: 26 }}>
                          <Tick on={l.checked} />
                          <span style={{ fontSize: "calc(13px * var(--fs, 1))", overflowWrap: "anywhere", textDecoration: l.checked ? "line-through" : undefined, color: l.checked ? "var(--text-3)" : "var(--text-2)" }}>{l.text}</span>
                          {l.note !== "" && (
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Tem anotação" style={{ flex: "none" }}>
                              <title>Tem anotação</title>
                              <path d="M5 4h14v12l-5 5H5z" /><path d="M14 21v-5h5" /><path d="M8 9h8M8 13h4" />
                            </svg>
                          )}
                        </div>
                        {l.note !== "" && <span style={{ marginLeft: 26, paddingLeft: 10, borderLeft: "2px solid var(--border-2)", fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-2)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{l.note}</span>}
                      </div>
                    ))}
                  </div>
                </Reveal>
              </div>
            );
          })}
        </div>
      </Reveal>
    </div>
  );
}

/** Conteúdo da página ligada à meta: níveis, cursos e, dentro de cada curso, as seções com as aulas. Só leitura: as caixinhas se marcam na página do curso. */
export function GoalOutline({ outline }: { outline: OutlineGroup[] }) {
  const [closedGroups, setClosedGroups] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const flip = (set: ReadonlySet<string>, key: string) => {
    const next = new Set(set);
    if (!next.delete(key)) next.add(key);
    return next;
  };
  if (outline.length === 0) return null;
  return (
    <div className="col" style={{ gap: 14 }}>
      <b style={{ fontWeight: 600, fontSize: "calc(13px * var(--fs, 1))" }}>Conteúdo</b>
      {outline.map((g, gi) => {
        const gKey = `g${gi}`;
        const gOpen = !closedGroups.has(gKey);
        return (
          <div key={gKey} className="col" style={{ gap: 2 }}>
            {g.title !== null && (
              <button className="plain row" type="button" aria-expanded={gOpen} onClick={() => setClosedGroups((c) => flip(c, gKey))} style={{ gap: 8, padding: "6px 4px", textAlign: "left", minWidth: 0, cursor: "pointer" }}>
                <Chev open={gOpen} />
                <span className="grow1" style={{ fontWeight: 600, fontSize: "calc(14px * var(--fs, 1))", overflowWrap: "anywhere" }}>{g.title}</span>
                <span style={small}>{g.done} de {g.total}</span>
                <span className="bar" style={{ width: 80, flex: "none" }}><span style={{ width: `${pct(g.done, g.total)}%` }} /></span>
              </button>
            )}
            <Reveal show={g.title === null || gOpen}>
              <div className="col" style={{ gap: 0, paddingLeft: g.title === null ? 0 : 14 }}>
                {g.items.map((item, ii) => {
                  const key = `${gKey}/${ii}`;
                  return <Item key={key} item={item} keyBase={key} open={open.has(key)} onToggle={() => setOpen((c) => flip(c, key))} openSections={open} onToggleSection={(k) => setOpen((c) => flip(c, k))} />;
                })}
              </div>
            </Reveal>
          </div>
        );
      })}
    </div>
  );
}
