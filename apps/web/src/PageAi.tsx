import { DEMO, DEMO_AI_OFF } from "./demo-flag";
import type { Editor, JSONContent } from "@tiptap/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ApiError, writingApi, type WritingAction, type WritingVoice } from "./api";
import { DocView } from "./DocView";
import { docToMarkdown } from "./doc-to-markdown";
import { markdownToDoc } from "./markdown-to-doc";
import { Presence } from "./Presence";
import type { Toast } from "./toast";

/**
 * IA da página (coluna à esquerda do texto): melhorar a página ou um trecho, explicar um trecho
 * com a voz de um assistente e escrever algo novo. Tudo passa por uma prévia: nada muda sem "Aplicar".
 */

const VOICES: { id: WritingVoice; name: string }[] = [
  { id: "renato", name: "Renato" },
  { id: "tutor", name: "Tutor" },
  { id: "hermes", name: "Hermes" },
];

const TITLES: Record<WritingAction, string> = {
  improve_page: "Página melhorada",
  improve_selection: "Trecho melhorado",
  explain: "Explicação",
  write: "Texto novo",
};

const APPLY: Record<WritingAction, string> = {
  improve_page: "Substituir a página",
  improve_selection: "Substituir o trecho",
  explain: "Inserir abaixo do trecho",
  write: "Inserir na página",
};

interface Range {
  from: number;
  to: number;
}

interface Result {
  action: WritingAction;
  markdown: string;
  doc: JSONContent;
  truncated: boolean;
  range: Range;
  request: Parameters<typeof writingApi.run>[0];
}

/** O trecho selecionado, como Markdown (vazio se não há seleção). */
export function selectionMarkdown(editor: Editor, range: Range): string {
  if (range.from === range.to) return "";
  const slice = editor.state.doc.slice(range.from, range.to);
  const json = slice.content.toJSON() as JSONContent[] | null;
  const blocks = (json ?? []).map((n) => (n.type === "text" ? { type: "paragraph", content: [n] } : n));
  return docToMarkdown({ type: "doc", content: blocks }).trim();
}

/** Fim do bloco de cima onde o trecho termina: ali entra uma explicação ou um texto novo. */
function afterBlock(editor: Editor, pos: number): number {
  const $pos = editor.state.doc.resolve(Math.min(pos, editor.state.doc.content.size));
  return $pos.depth >= 1 ? $pos.after(1) : editor.state.doc.content.size;
}

function errorText(err: unknown): string {
  if (!(err instanceof ApiError)) return "A IA não respondeu. Tente de novo.";
  const code = (err.body as { error?: string } | null)?.error;
  if (code === "ai_not_configured") return DEMO ? DEMO_AI_OFF : "Configure os assistentes em Configurações para usar a IA.";
  if (code === "ai_busy") return "A IA está ocupada. Tente de novo em instantes.";
  if (code === "page_too_short") return "A página tem pouco texto para melhorar.";
  return "A IA não respondeu. Tente de novo.";
}

export function PageAi({ editor, title, onToast, inline = false }: { editor: Editor | null; title: string; onToast: (t: Toast) => void; inline?: boolean }) {
  const [range, setRange] = useState<Range>({ from: 0, to: 0 });
  const [voice, setVoice] = useState<WritingVoice>("renato");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState<WritingAction | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  // Guarda a última seleção: ao clicar no painel o editor perde o foco, mas o trecho continua valendo.
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const { from, to } = editor.state.selection;
      setRange({ from, to });
    };
    update();
    editor.on("selectionUpdate", update);
    return () => {
      editor.off("selectionUpdate", update);
    };
  }, [editor]);

  const hasSelection = range.from !== range.to;

  const run = async (request: Result["request"], at: Range) => {
    setBusy(request.action);
    try {
      const { markdown, truncated } = await writingApi.run(request);
      const doc = markdownToDoc(markdown);
      if (!doc) throw new Error("empty");
      setResult({ action: request.action, markdown, doc, truncated, range: at, request });
    } catch (err) {
      onToast({ text: errorText(err) });
    } finally {
      setBusy(null);
    }
  };

  const start = (action: WritingAction) => {
    if (!editor || busy) return;
    const page = docToMarkdown(editor.getJSON());
    const selection = selectionMarkdown(editor, range);
    if ((action === "improve_selection" || action === "explain") && !selection) return;
    if (action === "write" && !instruction.trim()) return;
    void run(
      {
        action,
        title,
        page,
        ...(selection ? { selection } : {}),
        ...(action === "write" ? { instruction: instruction.trim() } : {}),
        ...(action === "explain" ? { voice } : {}),
      },
      range,
    );
  };

  const apply = () => {
    if (!editor || !result) return;
    const nodes = result.doc.content ?? [];
    const chain = editor.chain().focus();
    if (result.action === "improve_page") {
      chain.setContent(result.doc, { emitUpdate: true }).run();
    } else if (result.action === "improve_selection") {
      chain.insertContentAt(result.range, nodes).run();
    } else if (result.action === "explain") {
      chain.insertContentAt(afterBlock(editor, result.range.to), [{ type: "blockquote", content: nodes }]).run();
    } else {
      const at = result.range.from === result.range.to && editor.isFocused ? result.range.to : afterBlock(editor, result.range.to);
      chain.insertContentAt(at, nodes).run();
      setInstruction("");
    }
    setResult(null);
    onToast({ text: result.action === "explain" ? "Explicação inserida" : "Aplicado. Ctrl+Z desfaz." });
  };

  const voiceName = VOICES.find((v) => v.id === voice)!.name;

  return (
    <>
      <section className={inline ? "card ai-inline" : "ai-side"} aria-label="IA da página">
        <span className="eyebrow">IA na página</span>
        <button className="plain tr" type="button" disabled={!editor || busy !== null} onClick={() => start("improve_page")}>
          <span className="ai-spark" aria-hidden="true">✦</span>
          <span className="lab">{busy === "improve_page" ? "Melhorando…" : "Melhorar a página"}</span>
        </button>
        <button className="plain tr" type="button" disabled={!hasSelection || busy !== null} onClick={() => start("improve_selection")}>
          <span className="ai-spark" aria-hidden="true">✎</span>
          <span className="lab">{busy === "improve_selection" ? "Melhorando…" : "Melhorar o trecho"}</span>
        </button>
        <button className="plain tr" type="button" disabled={!hasSelection || busy !== null} onClick={() => start("explain")}>
          <span className="ai-spark" aria-hidden="true">?</span>
          <span className="lab">{busy === "explain" ? `${voiceName} pensando…` : `Explicar o trecho`}</span>
        </button>
        <label className="ai-voice-row">
          quem explica
          <select className="ai-voice" aria-label="Quem explica" value={voice} onChange={(e) => setVoice(e.target.value as WritingVoice)}>
            {VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        {!hasSelection && <span className="ai-hint">Selecione um trecho no texto para melhorar ou explicar só ele.</span>}
        <form
          className="col"
          style={{ gap: 6, marginTop: 6 }}
          onSubmit={(e) => {
            e.preventDefault();
            start("write");
          }}
        >
          <textarea
            className="add-task-input"
            rows={3}
            value={instruction}
            placeholder="Peça para a IA escrever… (ex.: um exemplo em Java de consumer)"
            aria-label="O que a IA deve escrever"
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                start("write");
              }
            }}
            style={{ height: "auto", padding: "8px 10px", resize: "vertical" }}
          />
          <button className="btn btn-sec btn-sm" type="submit" disabled={!instruction.trim() || busy !== null} style={{ alignSelf: "flex-start" }}>
            {busy === "write" ? "Escrevendo…" : "Escrever"}
          </button>
        </form>
      </section>

      {createPortal(
      <Presence show={result !== null}>
        {result && (
          <div className="checkin-scrim" role="dialog" aria-modal="true" aria-label={TITLES[result.action]} onMouseDown={(e) => e.target === e.currentTarget && setResult(null)}>
            <div className="checkin-box ai-result">
              <div className="row" style={{ gap: 8 }}>
                <b style={{ fontWeight: 600, fontSize: "calc(16px * var(--fs, 1))" }}>{TITLES[result.action]}</b>
                {result.action === "explain" && <span className="badge out">{VOICES.find((v) => v.id === result.request.voice)?.name ?? "Renato"}</span>}
                <span className="muted" style={{ marginLeft: "auto", fontSize: "calc(12px * var(--fs, 1))" }}>Prévia: nada mudou ainda</span>
              </div>
              {result.truncated && <div className="draft-ok" style={{ background: "var(--warning-soft)", color: "var(--warning)", borderColor: "transparent" }}>A resposta foi cortada no limite de tamanho. Para páginas grandes, melhore por trechos.</div>}
              <div className="ai-preview">
                <DocView doc={result.doc} />
              </div>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-pri" type="button" onClick={apply}>
                  {APPLY[result.action]}
                </button>
                <button className="btn btn-sec" type="button" disabled={busy !== null} onClick={() => void run(result.request, result.range)}>
                  {busy ? "Gerando…" : "Gerar de novo"}
                </button>
                <button className="btn btn-fan" type="button" onClick={() => setResult(null)} style={{ marginLeft: "auto" }}>
                  {result.action === "explain" ? "Fechar" : "Descartar"}
                </button>
              </div>
            </div>
          </div>
        )}
      </Presence>,
        // Fora da coluna lateral (que é "sticky" e prenderia o modal atrás do texto), dentro do tema do app.
        document.querySelector(".ds.app") ?? document.body,
      )}
    </>
  );
}
