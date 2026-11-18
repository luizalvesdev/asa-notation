import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pagesApi } from "./api";
import { createAutosaver, type Autosaver, type SaveState } from "./autosave";
import { bbox, boundsOf, commit, fitView, normalizeBox, newShapeId, redo, screenToWorld, startHistory, thin, topShapeAt, translate, undo, zoomAt, type History } from "./canvas-logic";
import { CANVAS_COLORS, COLOR_CSS, TOOL_KEY, TOOL_LABEL, type CanvasColor, type Shape, type Tool, type ViewState } from "./canvas-types";
import { Cover, CoverPicker } from "./Cover";
import { IconPicker } from "./IconPicker";
import { Icon } from "./icons";
import type { Page } from "./pages-types";
import { ShapeEl, ShapesSvg } from "./ShapesSvg";
import { SharePopover } from "./SharePopover";

interface CanvasViewProps {
  page: Page;
  onSaved: (page: Page) => void;
  onDelete: (page: Page) => void;
}

const GLYPH: Record<Tool, string> = { select: "↖", hand: "✋", pen: "✎", rect: "▭", ellipse: "◯", line: "╱", arrow: "→", text: "T", eraser: "⌫" };
const STROKES = [2, 4, 8];
const SAVE_LABEL: Record<SaveState, string> = { salvo: "Salvo", pendente: "Alterações pendentes", salvando: "Salvando…", erro: "Falha ao salvar" };

function initialShapes(body: unknown): Shape[] {
  const shapes = (body as { shapes?: unknown } | null)?.shapes;
  return Array.isArray(shapes) ? (shapes as Shape[]) : [];
}

export function CanvasView({ page, onSaved, onDelete }: CanvasViewProps) {
  const [history, setHistory] = useState<History>(() => startHistory(initialShapes(page.body)));
  const [view, setView] = useState<ViewState>({ x: 0, y: 0, zoom: 1 });
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<CanvasColor>("ink");
  const [stroke, setStroke] = useState(2);
  const [draft, setDraftState] = useState<Shape | null>(null);
  // A forma em andamento também fica numa ref: o soltar do mouse lê o valor mais novo, sem esperar a tela redesenhar.
  const draftRef = useRef<Shape | null>(null);
  const setDraft = (next: Shape | null) => {
    draftRef.current = next;
    setDraftState(next);
  };
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; x: number; y: number; value: string } | null>(null);
  const [title, setTitle] = useState(page.title);
  const [icon, setIcon] = useState(page.icon);
  const [cover, setCover] = useState(page.cover);
  const [saveState, setSaveState] = useState<SaveState>("salvo");
  const [sharing, setSharing] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ kind: "draw" | "move" | "pan" | "erase" | "text"; start: { x: number; y: number }; origin?: Shape; screen?: { x: number; y: number }; viewStart?: ViewState } | null>(null);
  const first = useRef(true);
  const saver = useRef<Autosaver | null>(null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const shapes = history.present;

  if (saver.current === null) {
    saver.current = createAutosaver({
      delayMs: 800,
      onState: setSaveState,
      send: async (patch) => {
        onSavedRef.current(await pagesApi.update(page.id, patch));
      },
    });
  }
  useEffect(() => {
    const s = saver.current;
    return () => void s?.flush().catch(() => undefined);
  }, []);

  // Enquadra o desenho existente ao abrir.
  useEffect(() => {
    const box = surface.current?.getBoundingClientRect();
    if (box) setView(fitView(boundsOf(shapes), box.width, box.height));
    // Só na abertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Guarda o quadro a cada mudança (menos a primeira carga).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    saver.current?.queue({ body: { type: "canvas", shapes } });
  }, [shapes]);

  const point = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const box = svg.current!.getBoundingClientRect();
      return { screen: { x: e.clientX - box.left, y: e.clientY - box.top }, world: screenToWorld(view, e.clientX - box.left, e.clientY - box.top) };
    },
    [view],
  );

  const change = (next: Shape[]) => setHistory((h) => commit(h, next));
  const tolerance = 6 / view.zoom;

  const commitText = () => {
    setEditing((cur) => {
      if (!cur) return null;
      const value = cur.value.replace(/\s+$/, "");
      if (cur.id) {
        if (value === "") change(shapes.filter((s) => s.id !== cur.id));
        else change(shapes.map((s) => (s.id === cur.id && s.type === "text" ? { ...s, text: value } : s)));
      } else if (value !== "") {
        change([...shapes, { id: newShapeId(), type: "text", color, stroke: 1, x: cur.x, y: cur.y, text: value, size: 12 + stroke * 2 }]);
      }
      return null;
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (editing) return commitText();
    const { screen, world } = point(e);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);

    if (tool === "hand" || e.button === 1) {
      drag.current = { kind: "pan", start: world, screen, viewStart: view };
      return;
    }
    if (tool === "text") {
      // O campo abre ao soltar: abrir agora faria o clique tirar o foco dele na hora.
      drag.current = { kind: "text", start: world };
      return;
    }
    if (tool === "select") {
      const hit = topShapeAt(shapes, world.x, world.y, tolerance);
      setSelected(hit?.id ?? null);
      if (hit) drag.current = { kind: "move", start: world, origin: hit };
      return;
    }
    if (tool === "eraser") {
      drag.current = { kind: "erase", start: world };
      const hit = topShapeAt(shapes, world.x, world.y, tolerance);
      if (hit) change(shapes.filter((s) => s.id !== hit.id));
      return;
    }
    drag.current = { kind: "draw", start: world };
    const id = newShapeId();
    const base = { id, color, stroke };
    if (tool === "pen") setDraft({ ...base, type: "pen", points: [world.x, world.y] });
    else if (tool === "rect" || tool === "ellipse") setDraft({ ...base, type: tool, x: world.x, y: world.y, w: 0, h: 0 });
    else if (tool === "line" || tool === "arrow") setDraft({ ...base, type: tool, x1: world.x, y1: world.y, x2: world.x, y2: world.y });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const { screen, world } = point(e);
    if (d.kind === "pan" && d.screen && d.viewStart) {
      setView({ ...d.viewStart, x: d.viewStart.x + (screen.x - d.screen.x), y: d.viewStart.y + (screen.y - d.screen.y) });
    } else if (d.kind === "move" && d.origin) {
      const moved = translate(d.origin, world.x - d.start.x, world.y - d.start.y);
      // Mostra o movimento sem encher o histórico: o commit só acontece ao soltar.
      setDraft(moved);
    } else if (d.kind === "erase") {
      const hit = topShapeAt(shapes, world.x, world.y, tolerance);
      if (hit) change(shapes.filter((s) => s.id !== hit.id));
    } else if (d.kind === "draw") {
      const cur = draftRef.current;
      if (!cur) return;
      if (cur.type === "pen") setDraft({ ...cur, points: [...cur.points, world.x, world.y] });
      else if (cur.type === "rect" || cur.type === "ellipse") setDraft({ ...cur, w: world.x - d.start.x, h: world.y - d.start.y });
      else if (cur.type === "line" || cur.type === "arrow") setDraft({ ...cur, x2: world.x, y2: world.y });
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === "text") return setEditing({ id: null, x: d.start.x, y: d.start.y, value: "" });
    if (!d || d.kind === "pan" || d.kind === "erase") return;
    const done = draftRef.current;
    setDraft(null);
    if (!done) return;
    if (d.kind === "move") {
      if (done.id && d.origin && JSON.stringify(done) !== JSON.stringify(d.origin)) change(shapes.map((s) => (s.id === done.id ? done : s)));
      return;
    }
    // Forma sem tamanho (só um clique) não vale, exceto o ponto da caneta.
    if (done.type === "rect" || done.type === "ellipse") {
      const b = normalizeBox(done.x, done.y, done.x + done.w, done.y + done.h);
      if (b.w < 3 && b.h < 3) return;
    }
    if ((done.type === "line" || done.type === "arrow") && Math.hypot(done.x2 - done.x1, done.y2 - done.y1) < 3) return;
    change([...shapes, done.type === "pen" ? { ...done, points: thin(done.points, 1.5 / view.zoom) } : done]);
  };

  // Teclado: atalhos de ferramenta, desfazer/refazer e apagar a seleção.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName))) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        setHistory((h) => (e.shiftKey ? redo(h) : undo(h)));
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        setHistory((h) => redo(h));
      } else if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        e.preventDefault();
        change(shapes.filter((s) => s.id !== selected));
        setSelected(null);
      } else if (!mod && !e.altKey && TOOL_KEY[e.key.toLowerCase()]) {
        setTool(TOOL_KEY[e.key.toLowerCase()]!);
      } else if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, shapes]);

  // Roda do mouse: Ctrl/Cmd dá zoom, sem tecla desloca a vista. Precisa de listener não passivo para impedir a rolagem da página.
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) setView((v) => zoomAt(v, e.clientX - box.left, e.clientY - box.top, Math.exp(-e.deltaY * 0.01)));
      else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const shown = useMemo(() => shapes.map((s) => (draft && drag.current?.kind === "move" && draft.id === s.id ? draft : s)), [shapes, draft]);
  const selectedShape = shown.find((s) => s.id === selected) ?? null;
  const box = selectedShape ? bbox(selectedShape) : null;
  const drawing = draft && drag.current?.kind === "draw" ? draft : null;
  const zoomBy = (factor: number) => {
    const b = surface.current?.getBoundingClientRect();
    if (b) setView((v) => zoomAt(v, b.width / 2, b.height / 2, factor));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ padding: "12px 24px 0" }}>
        <Cover cover={cover} height={120} />
        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <input className="p-title" value={title} placeholder="Sem título" aria-label="Título do quadro" maxLength={500} onChange={(e) => { setTitle(e.target.value); saver.current?.queue({ title: e.target.value }); }} style={{ fontSize: 28, lineHeight: "34px", flex: 1, minWidth: 160 }} />
          <span className="save-state" role="status" style={{ fontSize: 12, color: "var(--text-3)" }}>{SAVE_LABEL[saveState]}</span>
          <IconPicker icon={icon} onChange={(next) => { setIcon(next); saver.current?.queue({ icon: next }); }} />
          <CoverPicker cover={cover} onChange={(next) => { setCover(next); saver.current?.queue({ cover: next }); }} />
          <span style={{ position: "relative" }}>
            <button className="btn btn-fan btn-sm" type="button" aria-expanded={sharing} onClick={() => setSharing((v) => !v)}>Compartilhar</button>
            {sharing && <SharePopover pageId={page.id} onClose={() => setSharing(false)} />}
          </span>
          <button className="btn btn-fan btn-sm" type="button" onClick={() => onDelete(page)}><Icon name="trash" />Excluir</button>
        </div>
      </div>

      <div ref={surface} className="canvas-surface" style={{ position: "relative", flex: 1, minHeight: 360, margin: "12px 24px 24px", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--surface)" }}>
        <div className="row" role="toolbar" aria-label="Ferramentas do quadro" style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 5, gap: 2, padding: 4, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "var(--e2)", flexWrap: "wrap", justifyContent: "center", maxWidth: "calc(100% - 16px)" }}>
          {(Object.keys(TOOL_LABEL) as Tool[]).map((t) => (
            <button key={t} className={`btn btn-fan btn-ico btn-sm${tool === t ? " on" : ""}`} type="button" aria-pressed={tool === t} aria-label={TOOL_LABEL[t]} title={`${TOOL_LABEL[t]} (${Object.entries(TOOL_KEY).find(([, v]) => v === t)?.[0].toUpperCase()})`} onClick={() => setTool(t)}>{GLYPH[t]}</button>
          ))}
          <span style={{ width: 1, alignSelf: "stretch", background: "var(--border)", margin: "0 4px" }} />
          {CANVAS_COLORS.map((c) => (
            <button key={c} className="plain" type="button" aria-label={`Cor ${c}`} aria-pressed={color === c} onClick={() => { setColor(c); if (selected) change(shapes.map((s) => (s.id === selected ? { ...s, color: c } : s))); }} style={{ width: 20, height: 20, borderRadius: "50%", background: COLOR_CSS[c], boxShadow: color === c ? "0 0 0 2px var(--surface), 0 0 0 4px var(--accent)" : "inset 0 0 0 1px var(--border-2)", cursor: "pointer", margin: "0 2px" }} />
          ))}
          <span style={{ width: 1, alignSelf: "stretch", background: "var(--border)", margin: "0 4px" }} />
          {STROKES.map((w) => (
            <button key={w} className={`btn btn-fan btn-ico btn-sm${stroke === w ? " on" : ""}`} type="button" aria-pressed={stroke === w} aria-label={`Espessura ${w}`} onClick={() => setStroke(w)}><span style={{ width: 14, height: w, background: "currentColor", borderRadius: 2, display: "block" }} /></button>
          ))}
          <span style={{ width: 1, alignSelf: "stretch", background: "var(--border)", margin: "0 4px" }} />
          <button className="btn btn-fan btn-sm" type="button" disabled={history.past.length === 0} onClick={() => setHistory(undo)} aria-label="Desfazer" title="Desfazer (Ctrl+Z)">↶</button>
          <button className="btn btn-fan btn-sm" type="button" disabled={history.future.length === 0} onClick={() => setHistory(redo)} aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)">↷</button>
          <button className="btn btn-fan btn-sm" type="button" onClick={() => zoomBy(1 / 1.25)} aria-label="Reduzir">−</button>
          <button className="btn btn-fan btn-sm" type="button" onClick={() => { const b = surface.current?.getBoundingClientRect(); if (b) setView(fitView(boundsOf(shapes), b.width, b.height)); }} title="Enquadrar tudo">{Math.round(view.zoom * 100)}%</button>
          <button className="btn btn-fan btn-sm" type="button" onClick={() => zoomBy(1.25)} aria-label="Ampliar">+</button>
        </div>

        <svg ref={svg} role="application" aria-label="Quadro de desenho" width="100%" height="100%" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onDoubleClick={(e) => { const { world } = point(e); const hit = topShapeAt(shapes, world.x, world.y, tolerance); if (hit?.type === "text") setEditing({ id: hit.id, x: hit.x, y: hit.y, value: hit.text }); }} style={{ display: "block", touchAction: "none", cursor: tool === "hand" ? "grab" : tool === "select" ? "default" : tool === "text" ? "text" : "crosshair" }}>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
            <ShapesSvg shapes={shown} />
            {drawing && <ShapeEl shape={drawing} />}
            {box && <rect x={box.x - 4} y={box.y - 4} width={box.w + 8} height={box.h + 8} fill="none" stroke="var(--accent)" strokeWidth={1.5 / view.zoom} strokeDasharray={`${4 / view.zoom} ${3 / view.zoom}`} pointerEvents="none" />}
          </g>
        </svg>

        {editing && (
          <textarea
            className="inp"
            autoFocus
            aria-label="Texto do quadro"
            value={editing.value}
            placeholder="Digite…"
            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(null);
              else if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commitText();
              }
            }}
            rows={2}
            style={{ position: "absolute", left: editing.x * view.zoom + view.x, top: editing.y * view.zoom + view.y, minWidth: 140, zIndex: 6, fontSize: 14 }}
          />
        )}

        {shapes.length === 0 && !draft && !editing && (
          <p className="muted" style={{ position: "absolute", left: 0, right: 0, bottom: 20, textAlign: "center", fontSize: 13, pointerEvents: "none" }}>
            Escolha uma ferramenta e desenhe. Atalhos: P caneta, R retângulo, O elipse, L linha, A seta, T texto, V selecionar.
          </p>
        )}
      </div>
    </div>
  );
}
