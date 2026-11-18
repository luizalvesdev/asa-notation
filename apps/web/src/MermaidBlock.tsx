import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEffect, useState } from "react";
import { renderDiagram } from "./mermaid-render";

/** Bloco de diagrama: o código fica num campo ao lado e o desenho se atualiza enquanto se digita. */
export function MermaidBlock({ node, updateAttributes, editor, selected }: NodeViewProps) {
  const code = String(node.attrs.code ?? "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const editable = editor.isEditable;

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
        <div className="mermaid-svg" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <span className="sk" style={{ height: 120, display: "block", borderRadius: 8 }} aria-label="Desenhando o diagrama" />
      )}
    </NodeViewWrapper>
  );
}
