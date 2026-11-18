import { useMemo, useRef, useState } from "react";
import { pagesApi } from "./api";
import { readSelection } from "./import-files";
import { buildImportPlan, type ImportPlan } from "./import-parse";
import { nodesToImport, runImport, toggleSubtree, type ImportResult } from "./import-run";
import { markdownToDoc } from "./markdown-to-doc";
import { pageHash, routeHash } from "./nav";

type Source = "notion" | "vault";

const STEPS = ["Origem", "Arquivo", "Escolher", "Importar"] as const;

const SOURCES: { id: Source; title: string; text: string; how: string }[] = [
  { id: "notion", title: "Notion", text: "Páginas e subpáginas do seu workspace.", how: "No Notion: Configurações > Exportar todo o conteúdo do workspace > Markdown e CSV. Escolha o .zip baixado." },
  { id: "vault", title: "Vault de Markdown", text: "Obsidian, repositório do GitHub ou qualquer pasta de .md.", how: "Escolha uma pasta com as notas, ou o .zip do repositório (no GitHub: Code > Download ZIP)." },
];

export function ImportView({ onImported }: { onImported: () => void }) {
  const [step, setStep] = useState(0);
  const [source, setSource] = useState<Source>("notion");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [progress, setProgress] = useState({ done: 0, total: 1 });
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const chosen = useMemo(() => (plan ? nodesToImport(plan.nodes, selected) : []), [plan, selected]);

  const load = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setReading(true);
    setError(null);
    try {
      const { files, warnings: w } = await readSelection([...list]);
      const built = buildImportPlan(files);
      setWarnings(w);
      if (built.nodes.length === 0) {
        setPlan(null);
        setError("Não encontramos notas em Markdown nesta seleção.");
        return;
      }
      setPlan(built);
      setSelected(new Set(built.nodes.map((n) => n.key)));
      setStep(2);
    } catch {
      setError("Não foi possível ler os arquivos.");
    } finally {
      setReading(false);
    }
  };

  const start = async () => {
    if (chosen.length === 0) return;
    setStep(3);
    setResult(null);
    setProgress({ done: 0, total: chosen.length + 1 });
    const stamp = new Date().toLocaleDateString("pt-BR");
    try {
      const outcome = await runImport(`Importado em ${stamp}`, chosen, {
        create: (parentId, title, markdown) => pagesApi.create({ parentId, title, body: markdownToDoc(markdown) ?? undefined }),
        idOf: (page) => page.id,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setResult(outcome);
      onImported();
    } catch {
      onImported();
      setError("A importação foi interrompida. O que já foi criado continua em “Importado”.");
    }
  };

  const pct = Math.round((progress.done / progress.total) * 100);
  const finished = result !== null;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "36px 32px 120px", display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="row" style={{ alignItems: "flex-end", gap: 12 }}>
        <h1 style={{ fontFamily: "var(--serif)", fontWeight: 500, fontSize: 36, lineHeight: "42px", letterSpacing: "-.02em" }}>Importar</h1>
        <a className="btn btn-fan btn-sm" href={routeHash("configuracoes")} style={{ marginLeft: "auto" }}>Voltar às configurações</a>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <ol className="row" style={{ gap: 18, padding: "16px 20px", borderBottom: "1px solid var(--border)", flexWrap: "wrap", listStyle: "none", margin: 0 }} aria-label="Passos">
          {STEPS.map((name, i) => (
            <li key={name} aria-current={i === step ? "step" : undefined} className="row" style={{ gap: 8, fontSize: 13, color: i === step ? "var(--text)" : "var(--text-3)", fontWeight: i === step ? 600 : 400 }}>
              <span className="kpad" style={i <= step ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>{i < step ? "✓" : i + 1}</span>
              {name}
            </li>
          ))}
        </ol>

        <div style={{ padding: "24px 24px 20px", minHeight: 300 }}>
          {step === 0 && (
            <div className="col enter" style={{ gap: 14 }}>
              <h2 style={{ font: "600 18px/26px var(--sans)" }}>De onde vamos importar?</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
                {SOURCES.map((s) => (
                  <button key={s.id} className="plain card" type="button" aria-pressed={source === s.id} onClick={() => setSource(s.id)} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 6, textAlign: "left", cursor: "pointer", boxShadow: source === s.id ? "inset 0 0 0 2px var(--accent)" : "none" }}>
                    <b style={{ fontWeight: 600 }}>{s.title}</b>
                    <span style={{ fontSize: 13, color: "var(--text-2)" }}>{s.text}</span>
                  </button>
                ))}
              </div>
              <span className="help">Tudo é lido no seu navegador: os arquivos não sobem para nenhum outro lugar além do seu asa.</span>
            </div>
          )}

          {step === 1 && (
            <div className="col enter" style={{ gap: 14 }}>
              <h2 style={{ font: "600 18px/26px var(--sans)" }}>Escolher o arquivo</h2>
              <p style={{ fontSize: 14, lineHeight: "21px", color: "var(--text-2)" }}>{SOURCES.find((s) => s.id === source)!.how}</p>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-pri" type="button" disabled={reading} onClick={() => fileInput.current?.click()}>{reading ? "Lendo…" : "Escolher .zip ou arquivos .md"}</button>
                {source === "vault" && <button className="btn btn-sec" type="button" disabled={reading} onClick={() => folderInput.current?.click()}>Escolher uma pasta</button>}
              </div>
              <input ref={fileInput} type="file" accept=".zip,.md,.markdown" multiple hidden aria-label="Arquivos para importar" onChange={(e) => { void load(e.target.files); e.target.value = ""; }} />
              <input ref={folderInput} type="file" hidden aria-label="Pasta para importar" {...({ webkitdirectory: "" } as object)} onChange={(e) => { void load(e.target.files); e.target.value = ""; }} />
              {error && <span role="alert" style={{ fontSize: 13, color: "var(--danger)" }}>{error}</span>}
            </div>
          )}

          {step === 2 && plan && (
            <div className="col enter" style={{ gap: 10 }}>
              <h2 style={{ font: "600 18px/26px var(--sans)" }}>Escolha o que importar</h2>
              <div className="row" style={{ gap: 8, fontSize: 13, color: "var(--text-2)" }}>
                <span>{plan.nodes.length} {plan.nodes.length === 1 ? "página encontrada" : "páginas encontradas"}</span>
                {plan.skipped.length > 0 && <span>· {plan.skipped.length} {plan.skipped.length === 1 ? "arquivo ignorado" : "arquivos ignorados"}</span>}
                <button className="btn btn-fan btn-sm" type="button" style={{ marginLeft: "auto" }} onClick={() => setSelected(selected.size === plan.nodes.length ? new Set() : new Set(plan.nodes.map((n) => n.key)))}>{selected.size === plan.nodes.length ? "Desmarcar tudo" : "Marcar tudo"}</button>
              </div>
              <div role="group" aria-label="Páginas" style={{ maxHeight: 340, overflow: "auto", border: "1px solid var(--border)", borderRadius: 10, padding: 6 }}>
                {plan.nodes.map((n) => {
                  const on = selected.has(n.key);
                  return (
                    <button key={n.key} className="plain" type="button" role="checkbox" aria-checked={on} onClick={() => setSelected(toggleSubtree(plan.nodes, selected, n.key))} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 32, padding: `2px 8px 2px ${8 + n.depth * 18}px`, textAlign: "left", cursor: "pointer", borderRadius: 6 }}>
                      <span className={`cb${on ? " on" : ""}`} style={{ width: 16, height: 16 }}><svg className="ico tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" pathLength="1" /></svg></span>
                      <span className="grow1 trunc" style={{ fontSize: 14 }}>{n.title}</span>
                      {!n.isFile && <span className="badge out" style={{ height: 18, fontSize: 11 }}>pasta</span>}
                    </button>
                  );
                })}
              </div>
              {warnings.map((w) => <span key={w} style={{ fontSize: 12, color: "var(--warning)" }}>{w}</span>)}
              {plan.skipped.length > 0 && (
                <details style={{ fontSize: 12, color: "var(--text-2)" }}>
                  <summary style={{ cursor: "pointer" }}>Ver arquivos ignorados</summary>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18, maxHeight: 120, overflow: "auto" }}>
                    {plan.skipped.slice(0, 50).map((s) => <li key={s.path}>{s.path}: {s.reason}</li>)}
                  </ul>
                </details>
              )}
              <span className="help">Destino: uma nova página “Importado” na árvore. Nada existente é alterado. Imagens locais e tabelas CSV não vão junto.</span>
            </div>
          )}

          {step === 3 && (
            <div className="col enter" style={{ gap: 14 }}>
              <h2 style={{ font: "600 18px/26px var(--sans)" }}>{finished ? "Importação concluída" : "Importando…"}</h2>
              <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progresso da importação"><span style={{ width: `${pct}%`, animation: "none", transition: "width var(--medio) var(--padrao)" }} /></div>
              <span style={{ fontSize: 13, color: "var(--text-2)" }}>{progress.done} de {progress.total}</span>
              {error && <span role="alert" style={{ fontSize: 13, color: "var(--danger)" }}>{error}</span>}
              {result && (
                <div className="draft-ok enter">
                  <svg className="ico" viewBox="0 0 24 24" aria-hidden="true" style={{ color: "var(--success)" }}><path d="M5 12.5l4.5 4.5L19 7" /></svg>
                  {result.created} {result.created === 1 ? "página importada" : "páginas importadas"}{result.failed.length > 0 ? `, ${result.failed.length} com erro` : ""}.
                  {result.rootId && <a className="btn btn-sec btn-sm" href={pageHash(result.rootId)} style={{ marginLeft: "auto" }}>Abrir “Importado”</a>}
                </div>
              )}
              {result && result.failed.length > 0 && (
                <ul style={{ fontSize: 12, color: "var(--danger)", margin: 0, paddingLeft: 18 }}>{result.failed.slice(0, 20).map((f) => <li key={f.key}>{f.title}</li>)}</ul>
              )}
            </div>
          )}
        </div>

        <div className="row" style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", gap: 8 }}>
          {step > 0 && step < 3 && <button className="btn btn-fan" type="button" onClick={() => setStep(step - 1)}>Voltar</button>}
          {step === 0 && <button className="btn btn-pri" type="button" style={{ marginLeft: "auto" }} onClick={() => setStep(1)}>Continuar</button>}
          {step === 2 && <button className="btn btn-pri" type="button" style={{ marginLeft: "auto" }} disabled={chosen.length === 0} onClick={() => void start()}>Importar {chosen.length} {chosen.length === 1 ? "página" : "páginas"}</button>}
          {step === 3 && finished && <a className="btn btn-pri" href={routeHash("hoje")} style={{ marginLeft: "auto" }}>Concluir</a>}
        </div>
      </div>
    </div>
  );
}
