import { useCallback, useEffect, useState } from "react";
import { pagesApi } from "./api";
import { Icon } from "./icons";
import { displayTitle } from "./pages-tree";
import type { Page, TrashItem } from "./pages-types";
import { formatDeleted } from "./search-utils";

interface TrashViewProps {
  /** Chamado depois de restaurar, para a árvore da barra lateral se atualizar. */
  onRestored: (page: Page) => void;
}

type State = { status: "carregando" } | { status: "erro" } | { status: "pronto"; items: TrashItem[] };

export function TrashView({ onRestored }: TrashViewProps) {
  const [state, setState] = useState<State>({ status: "carregando" });
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setState({ status: "carregando" });
    pagesApi
      .trash()
      .then((items) => live && setState({ status: "pronto", items }))
      .catch(() => live && setState({ status: "erro" }));
    return () => {
      live = false;
    };
  }, [attempt]);

  const restore = useCallback(
    async (item: TrashItem) => {
      setBusy(item.id);
      setFailed(null);
      try {
        const page = await pagesApi.restore(item.id);
        setState((current) => (current.status === "pronto" ? { status: "pronto", items: current.items.filter((i) => i.id !== item.id) } : current));
        onRestored(page);
      } catch {
        setFailed(item.id);
      } finally {
        setBusy(null);
      }
    },
    [onRestored],
  );

  return (
    <div className="screen">
      <h1 className="screen-title">Lixeira</h1>
      <p className="muted" style={{ marginTop: 8, fontSize: "calc(14px * var(--fs, 1))", lineHeight: "calc(22px * var(--fs, 1))" }}>
        Páginas apagadas ficam aqui. Restaurar traz de volta a página e tudo que estava dentro dela.
      </p>

      <div className="card" style={{ marginTop: 24, overflow: "hidden" }} aria-busy={state.status === "carregando"}>
        {state.status === "carregando" && (
          <div className="col" style={{ gap: 14, padding: 16 }} aria-label="Carregando a lixeira">
            <span className="sk" style={{ height: 16, width: "60%" }} />
            <span className="sk" style={{ height: 16, width: "45%" }} />
            <span className="sk" style={{ height: 16, width: "52%" }} />
          </div>
        )}
        {state.status === "erro" && (
          <div className="col" style={{ gap: 10, padding: 16, alignItems: "flex-start" }}>
            <span className="muted">Não foi possível carregar a lixeira.</span>
            <button className="btn btn-sec btn-sm" type="button" onClick={() => setAttempt((n) => n + 1)}>
              Tentar de novo
            </button>
          </div>
        )}
        {state.status === "pronto" && state.items.length === 0 && (
          <div className="col" style={{ gap: 4, padding: 24, alignItems: "center", textAlign: "center" }}>
            <Icon name="trash" large />
            <b style={{ fontWeight: 600 }}>A lixeira está vazia</b>
            <span className="muted" style={{ fontSize: "calc(13px * var(--fs, 1))" }}>Quando você excluir uma página, ela aparece aqui.</span>
          </div>
        )}
        {state.status === "pronto" &&
          state.items.map((item) => (
            <div key={item.id} className="row trash-row">
              {item.icon ? <span className="page-emoji" aria-hidden="true">{item.icon}</span> : <Icon name="doc" />}
              <span className="col grow1" style={{ gap: 0 }}>
                <span className="trunc">{displayTitle(item.title)}</span>
                <span className="subtle trunc" style={{ fontSize: "calc(12px * var(--fs, 1))" }}>
                  Apagada {formatDeleted(item.deletedAt, Date.now())}
                  {item.parentTitle !== null && ` · estava em ${displayTitle(item.parentTitle)}`}
                </span>
              </span>
              {failed === item.id && <span style={{ color: "var(--danger)", fontSize: "calc(12px * var(--fs, 1))" }}>Falhou</span>}
              <button className="btn btn-sec btn-sm" type="button" disabled={busy === item.id} aria-busy={busy === item.id} onClick={() => void restore(item)}>
                Restaurar
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
