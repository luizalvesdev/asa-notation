import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, isConflict, pagesApi } from "./api";
import { createAutosaver, type Autosaver, type SaveState } from "./autosave";
import { Backlinks } from "./Backlinks";
import { CanvasView } from "./CanvasView";
import { Cover, CoverPicker } from "./Cover";
import { DatabaseView } from "./DatabaseView";
import { PropertiesPanel } from "./PropertiesPanel";
import { normalizeSchema } from "./use-database";
import type { PropValue, Schema } from "./db-types";
import type { Toast } from "./toast";
import { Editor } from "./Editor";
import { HistoryPanel } from "./HistoryPanel";
import { IconPicker } from "./IconPicker";
import { SharePopover } from "./SharePopover";
import { Icon } from "./icons";
import type { Page, TreeNode } from "./pages-types";

interface PageViewProps {
  pageId: string;
  nodes: TreeNode[];
  onSaved: (page: Page) => void;
  onDelete: (page: Page) => void;
  onToast: (toast: Toast) => void;
}

type Load = { status: "carregando" } | { status: "ausente" } | { status: "erro" } | { status: "pronto"; page: Page };

export function PageView({ pageId, nodes, onSaved, onDelete, onToast }: PageViewProps) {
  const [load, setLoad] = useState<Load>({ status: "carregando" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setLoad({ status: "carregando" });
    pagesApi
      .get(pageId)
      .then((page) => live && setLoad({ status: "pronto", page }))
      .catch((err: unknown) => live && setLoad({ status: err instanceof ApiError && err.status === 404 ? "ausente" : "erro" }));
    return () => {
      live = false;
    };
  }, [pageId, attempt]);

  if (load.status === "carregando") {
    return (
      <div className="page" style={{ paddingTop: 56 }} aria-busy="true" aria-label="Carregando página">
        <span className="sk" style={{ height: 40, width: "55%" }} />
        <div className="col" style={{ gap: 10, marginTop: 28 }}>
          <span className="sk" style={{ height: 14, width: "90%" }} />
          <span className="sk" style={{ height: 14, width: "80%" }} />
          <span className="sk" style={{ height: 14, width: "85%" }} />
        </div>
      </div>
    );
  }
  if (load.status === "ausente") {
    return (
      <div className="page" style={{ paddingTop: 56 }}>
        <h1 className="p-title">Página não encontrada</h1>
        <p className="muted">Ela pode ter sido apagada. Veja a Lixeira para restaurar.</p>
      </div>
    );
  }
  if (load.status === "erro") {
    return (
      <div className="page" style={{ paddingTop: 56 }}>
        <h1 className="p-title">Não foi possível abrir</h1>
        <button className="btn btn-sec" type="button" onClick={() => setAttempt((n) => n + 1)}>
          Tentar de novo
        </button>
      </div>
    );
  }
  if (load.page.kind === "canvas") {
    return <CanvasView key={load.page.id} page={load.page} onSaved={onSaved} onDelete={onDelete} />;
  }
  if (load.page.kind === "database") {
    return <DatabaseView key={load.page.id} page={load.page} nodes={nodes} onSaved={onSaved} onDelete={onDelete} onToast={onToast} />;
  }
  return <PageEditor key={`${load.page.id}:${attempt}`} initial={load.page} nodes={nodes} onSaved={onSaved} onDelete={onDelete} onReload={() => setAttempt((n) => n + 1)} />;
}

interface PageEditorProps {
  initial: Page;
  nodes: TreeNode[];
  onSaved: (page: Page) => void;
  onDelete: (page: Page) => void;
  onReload: () => void;
}

const SAVE_LABEL: Record<SaveState, string> = {
  salvo: "Salvo",
  pendente: "Alterações pendentes",
  salvando: "Salvando…",
  erro: "Falha ao salvar",
};

function PageEditor({ initial, nodes, onSaved, onDelete, onReload }: PageEditorProps) {
  const [title, setTitle] = useState(initial.title);
  const [favorite, setFavorite] = useState(initial.favorite);
  const [icon, setIcon] = useState(initial.icon);
  const [cover, setCover] = useState(initial.cover);
  const [saveState, setSaveState] = useState<SaveState>("salvo");
  const [conflict, setConflict] = useState<Page | null>(null);
  const [focusBody, setFocusBody] = useState(0);
  const [panel, setPanel] = useState<"history" | "share" | null>(null);
  const [schema, setSchema] = useState<Schema | null>(null);
  const [rowProps, setRowProps] = useState<Record<string, PropValue>>((initial.props ?? {}) as Record<string, PropValue>);

  // Linha de database: busca o esquema da database para mostrar as propriedades.
  useEffect(() => {
    if (initial.kind !== "row" || !initial.parentId) return;
    let live = true;
    pagesApi.get(initial.parentId).then((db) => live && setSchema(normalizeSchema(db.schema))).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [initial.kind, initial.parentId]);
  const [historyBody, setHistoryBody] = useState<unknown>(null);
  const rev = useRef(initial.rev);
  const latest = useRef({ page: initial, onSaved });
  latest.current.onSaved = onSaved;
  const saver = useRef<Autosaver | null>(null);

  if (saver.current === null) {
    saver.current = createAutosaver({
      delayMs: 700,
      onState: setSaveState,
      send: async (patch) => {
        try {
          const saved = await pagesApi.update(initial.id, patch, rev.current);
          rev.current = saved.rev;
          latest.current.page = saved;
          latest.current.onSaved(saved);
        } catch (err) {
          if (isConflict(err)) setConflict(err.body.page);
          throw err;
        }
      },
    });
  }

  // Ao sair da página (ou desmontar), envia o que ainda estiver pendente.
  useEffect(() => {
    const current = saver.current;
    return () => {
      void current?.flush().catch(() => undefined);
    };
  }, []);

  const keepMine = useCallback(() => {
    if (!conflict) return;
    rev.current = conflict.rev;
    setConflict(null);
    void saver.current?.flush().catch(() => undefined);
  }, [conflict]);

  const reloadFromServer = useCallback(() => {
    saver.current?.discard();
    onReload();
  }, [onReload]);

  const toggleFavorite = () => {
    const next = !favorite;
    setFavorite(next);
    saver.current?.queue({ favorite: next });
  };

  return (
    <div className="page">
      <Cover cover={cover} />
      <div className="page-head">
        <span className={`save-state${saveState === "erro" ? " erro" : ""}`} role="status">
          {SAVE_LABEL[saveState]}
          {saveState === "erro" && !conflict && (
            <button className="btn btn-fan btn-sm" type="button" onClick={() => void saver.current?.flush().catch(() => undefined)}>
              Tentar de novo
            </button>
          )}
        </span>
        <span className="spacer" />
        <CoverPicker cover={cover} onChange={(next) => { setCover(next); saver.current?.queue({ cover: next }); }} />
        <IconPicker icon={icon} onChange={(next) => { setIcon(next); saver.current?.queue({ icon: next }); }} />
        <span style={{ position: "relative" }}>
          <button className="btn btn-fan btn-sm" type="button" aria-expanded={panel === "share"} onClick={() => setPanel(panel === "share" ? null : "share")}>
            Compartilhar
          </button>
          {panel === "share" && <SharePopover pageId={initial.id} onClose={() => setPanel(null)} />}
        </span>
        <button
          className="btn btn-fan btn-sm"
          type="button"
          aria-expanded={panel === "history"}
          onClick={() => {
            if (panel === "history") return setPanel(null);
            // Garante que o que foi digitado já está salvo antes de comparar.
            void saver.current?.flush().catch(() => undefined).then(() => {
              setHistoryBody(latest.current.page.body);
              setPanel("history");
            });
          }}
        >
          Histórico
        </button>
        <button className={`btn btn-fan btn-sm${favorite ? " on" : ""}`} type="button" aria-pressed={favorite} onClick={toggleFavorite}>
          <Icon name="star" />
          {favorite ? "Favorita" : "Favoritar"}
        </button>
        <button className="btn btn-fan btn-sm" type="button" onClick={() => onDelete(latest.current.page)}>
          <Icon name="trash" />
          Excluir
        </button>
      </div>

      {conflict && (
        <div className="conflict" role="alert">
          <span>Esta página foi alterada em outro lugar.</span>
          <button className="btn btn-fan btn-sm" type="button" onClick={keepMine}>
            Manter a minha versão
          </button>
          <button className="btn btn-fan btn-sm" type="button" onClick={reloadFromServer}>
            Carregar a versão salva
          </button>
        </div>
      )}

      <input
        className="p-title"
        value={title}
        placeholder="Sem título"
        aria-label="Título da página"
        maxLength={500}
        onChange={(e) => {
          setTitle(e.target.value);
          saver.current?.queue({ title: e.target.value });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            setFocusBody((n) => n + 1);
          }
        }}
      />
      {schema && (
        <PropertiesPanel
          schema={schema}
          values={rowProps}
          onChange={(values) => {
            setRowProps(values);
            // O servidor mescla; enviamos todos os valores atuais (null apaga os que sumiram).
            const cleared = Object.fromEntries(schema.properties.filter((p) => values[p.id] === undefined).map((p) => [p.id, null]));
            saver.current?.queue({ props: { ...cleared, ...values } });
          }}
        />
      )}
      <Editor initial={initial.body} focusSignal={focusBody} pages={nodes} selfId={initial.id} onChange={(doc) => saver.current?.queue({ body: doc })} />
      <Backlinks pageId={initial.id} />
      {panel === "history" && <HistoryPanel pageId={initial.id} currentBody={historyBody} onClose={() => setPanel(null)} onRestored={() => { setPanel(null); saver.current?.discard(); onReload(); }} />}
    </div>
  );
}
