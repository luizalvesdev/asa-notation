import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { downloadFile } from "./download";
import { renderDiagram } from "./mermaid-render";
import { INITIAL_VIEW, isInitial, panBy, wheelFactor, zoomAt, type View } from "./pan-zoom";
import { standaloneSvg, svgToPng } from "./svg-export";

/** Bloco de diagrama: o código fica num campo ao lado e o desenho se atualiza enquanto se digita. */
export function MermaidBlock({ node, updateAttributes, editor, selected }: NodeViewProps) {
  const code = String(node.attrs.code ?? "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const editable = editor.isEditable;
  const [view, setView] = useState<View>(INITIAL_VIEW);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [grabbing, setGrabbing] = useState(false);

  /** Zoom ao redor de um ponto do quadro (padrão: o centro, para os botões). */
  const zoomBy = (factor: number, at?: { x: number; y: number }) => {
    const box = frame.current?.getBoundingClientRect();
    const px = at?.x ?? (box ? box.width / 2 : 0);
    const py = at?.y ?? (box ? box.height / 2 : 0);
    setView((v) => zoomAt(v, factor, px, py));
  };

  // A roda do mouse dá zoom ao redor do cursor (pinça no trackpad também). Com o mouse sobre o diagrama a página não rola:
  // é a escolha do produto. Precisa de um ouvinte nativo não passivo para poder impedir a rolagem.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = el.getBoundingClientRect();
      zoomBy(wheelFactor(e.deltaY, e.deltaMode), { x: e.clientX - box.left, y: e.clientY - box.top });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [svg]);

  useEffect(() => {
    let live = true;
    const dark = !!document.querySelector(".ds.escuro");
    const timer = setTimeout(() => {
      renderDiagram(code, dark)
        .then((out) => {
          if (!live) return;
          setSvg(out);
          setError(null);
        })
        .catch((err: unknown) => live && setError(err instanceof Error ? err.message.split("\n")[0]! : "Diagrama inválido"));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [code]);

  return (
    <NodeViewWrapper className={`mermaid-block${selected ? " is-selected" : ""}`} contentEditable={false}>
      <div className="mermaid-bar">
        <span className="badge out" style={{ height: 20 }}>Mermaid</span>
        {editable && (
          <button className="btn btn-fan btn-sm" type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? "Fechar código" : "Editar código"}
          </button>
        )}
        {svg && !error && (
          <span className="row" style={{ marginLeft: "auto", gap: 2 }}>
            <button className="btn btn-fan btn-sm" type="button" title="Diminuir (roda do mouse)" aria-label="Diminuir o diagrama" onClick={() => zoomBy(1 / 1.25)}>−</button>
            <button className="btn btn-fan btn-sm" type="button" title="Ajustar à tela" aria-label="Ajustar o diagrama" onClick={() => setView(INITIAL_VIEW)} disabled={isInitial(view)} style={{ minWidth: 48 }}>
              {Math.round(view.scale * 100)}%
            </button>
            <button className="btn btn-fan btn-sm" type="button" title="Aumentar (roda do mouse)" aria-label="Aumentar o diagrama" onClick={() => zoomBy(1.25)}>+</button>
            <button className="btn btn-fan btn-sm" type="button" title="Salvar como SVG" onClick={() => downloadFile("diagrama.svg", standaloneSvg(svg), "image/svg+xml")}>SVG</button>
            <button
              className="btn btn-fan btn-sm"
              type="button"
              title="Salvar como PNG"
              onClick={() => {
                const css = getComputedStyle(document.querySelector(".ds") ?? document.body).getPropertyValue("--surface").trim() || "#ffffff";
                void svgToPng(svg, css).then((blob) => downloadFile("diagrama.png", blob, "image/png")).catch(() => undefined);
              }}
            >
              PNG
            </button>
          </span>
        )}
      </div>
      {editable && open && (
        <textarea
          className="inp mono mermaid-code"
          value={code}
          rows={Math.min(14, Math.max(4, code.split("\n").length + 1))}
          spellCheck={false}
          aria-label="Código do diagrama"
          onChange={(e) => updateAttributes({ code: e.target.value })}
        />
      )}
      {error ? (
        <div className="mermaid-error" role="alert">
          Não foi possível desenhar: {error}
        </div>
      ) : svg ? (
        // O SVG vem do próprio Mermaid em modo "strict" (limpo com DOMPurify).
        <div
          ref={frame}
          className={`mermaid-view${grabbing ? " is-grabbing" : ""}`}
          title="Arraste para mover · roda do mouse para zoom · duplo clique para ajustar"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            drag.current = { x: e.clientX, y: e.clientY };
            e.currentTarget.setPointerCapture(e.pointerId);
            setGrabbing(true);
          }}
          onPointerMove={(e) => {
            const from = drag.current;
            if (!from) return;
            drag.current = { x: e.clientX, y: e.clientY };
            setView((v) => panBy(v, e.clientX - from.x, e.clientY - from.y));
          }}
          onPointerUp={() => {
            drag.current = null;
            setGrabbing(false);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setGrabbing(false);
          }}
          onDoubleClick={() => setView(INITIAL_VIEW)}
        >
          <div className="mermaid-svg" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }} dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
      ) : (
        <span className="sk" style={{ height: 120, display: "block", borderRadius: 8 }} aria-label="Desenhando o diagrama" />
      )}
    </NodeViewWrapper>
  );
}
