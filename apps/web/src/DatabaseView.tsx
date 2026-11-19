import { useEffect, useMemo, useRef, useState } from "react";
import { settingsApi } from "./api";
import { Popover } from "./db-cells";
import { newId } from "./db-logic";
import { newView, viewRows } from "./db-logic";
import { FilterMenu, PropertiesMenu, SortMenu, ViewSettings } from "./db-menus";
import { VIEW_LABEL, type PropValue, type ViewType } from "./db-types";
import { CalendarView, KanbanView, ListView, TableView, type ViewProps } from "./db-views";
import { Icon, type IconName } from "./icons";
import type { Page, TreeNode } from "./pages-types";
import { PageView } from "./PageView";
import type { Toast } from "./toast";
import { useDatabase } from "./use-database";
import { Presence } from "./Presence";
import { askConfirm } from "./confirm";

interface DatabaseViewProps {
  page: Page;
  nodes: TreeNode[];
  onSaved: (page: Page) => void;
  onDelete: (page: Page) => void;
  onToast: (toast: Toast) => void;
}

const VIEW_ICON: Record<ViewType, IconName> = { table: "table", kanban: "kanban", list: "list", calendar: "calendar" };

export function DatabaseView({ page, nodes, onSaved, onDelete, onToast }: DatabaseViewProps) {
  const db = useDatabase(page, onSaved);
  const [viewId, setViewId] = useState<string | null>(null);
  const [peek, setPeek] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<0 | 1>(1);
  const [addOpen, setAddOpen] = useState(false);
  const addAnchor = useRef<HTMLButtonElement>(null);
  const [renaming, setRenaming] = useState(false);
  const renameAnchor = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    settingsApi.get().then((s) => live && setWeekStart(s.weekStart)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const view = db.schema.views.find((v) => v.id === viewId) ?? db.schema.views[0];
  const rows = useMemo(() => (view ? viewRows(db.rows, db.schema, view) : []), [db.rows, db.schema, view]);
  const databases = useMemo(() => nodes.filter((n) => n.kind === "database").map((n) => ({ id: n.id, title: n.title })), [nodes]);

  const add = async (props?: Record<string, PropValue>) => {
    const row = await db.addRow("", props);
    if (!row) return onToast({ text: "Não foi possível criar a linha." });
    setPeek(row.id);
  };
  const remove = async (rowId: string) => {
    const ok = await db.removeRow(rowId);
    if (!ok) return onToast({ text: "Não foi possível apagar a linha." });
    if (peek === rowId) setPeek(null);
    onToast({ text: "Linha apagada", action: { label: "Desfazer", run: () => void db.restoreRow(rowId) } });
  };

  const viewProps: ViewProps | null = view
    ? { rows, schema: db.schema, view, onOpen: setPeek, onProps: db.updateProps, onRename: db.renameRow, onRemove: (id) => void remove(id), onAdd: (props) => void add(props) }
    : null;

  return (
    <div style={{ padding: "36px 40px 120px", maxWidth: 1240 }}>
      <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <input
          className="p-title"
          value={db.title}
          placeholder="Sem título"
          aria-label="Título da database"
          maxLength={500}
          onChange={(e) => db.setTitle(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <button className="btn btn-fan btn-sm" type="button" onClick={() => onDelete(page)}><Icon name="trash" />Excluir</button>
      </div>

      <div className="tabs" role="tablist" aria-label="Views" style={{ marginTop: 12, overflowX: "auto", overflowY: "hidden" }}>
        {db.schema.views.map((v) => (
          <button key={v.id} className={`plain tab${view?.id === v.id ? " on" : ""}`} type="button" role="tab" aria-selected={view?.id === v.id} onClick={() => setViewId(v.id)} style={{ position: "relative", padding: "8px 12px", height: 36, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
            <Icon name={VIEW_ICON[v.type]} />
            {v.name}
          </button>
        ))}
        <button ref={addAnchor} className="btn btn-fan btn-sm" type="button" aria-label="Nova view" aria-haspopup="menu" aria-expanded={addOpen} onClick={() => setAddOpen((o) => !o)} style={{ alignSelf: "center" }}><Icon name="plus" /></button>
        <Presence show={addOpen}><Popover anchor={addAnchor} onClose={() => setAddOpen(false)} width={200}>
            <div role="menu" aria-label="Nova view">
              <div className="mgroup">Nova view</div>
              {(Object.keys(VIEW_LABEL) as ViewType[]).map((type) => (
                <button key={type} className="plain mrow" type="button" role="menuitem" onClick={() => {
                  const created = newView(type, db.schema, newId(), VIEW_LABEL[type]);
                  db.saveSchema({ ...db.schema, views: [...db.schema.views, created] });
                  setViewId(created.id);
                  setAddOpen(false);
                }}><Icon name={VIEW_ICON[type]} />{VIEW_LABEL[type]}</button>
              ))}
            </div>
          </Popover></Presence>
      </div>

      {view && (
        <div className="row" style={{ gap: 6, flexWrap: "wrap", margin: "12px 0" }}>
          <ViewSettings schema={db.schema} view={view} onSchema={db.saveSchema} />
          <FilterMenu schema={db.schema} view={view} onSchema={db.saveSchema} />
          <SortMenu schema={db.schema} view={view} onSchema={db.saveSchema} />
          <PropertiesMenu schema={db.schema} view={view} onSchema={db.saveSchema} databases={databases} />
          <button ref={renameAnchor} className="btn btn-fan btn-sm" type="button" aria-expanded={renaming} onClick={() => setRenaming((o) => !o)}>Esta view</button>
          <Presence show={renaming}>{renaming && (<Popover anchor={renameAnchor} onClose={() => setRenaming(false)} width={260}>
              <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                <input className="inp" aria-label="Nome da view" value={view.name} onChange={(e) => db.saveSchema({ ...db.schema, views: db.schema.views.map((v) => (v.id === view.id ? { ...v, name: e.target.value } : v)) })} />
                <button className="btn btn-fan btn-sm" type="button" disabled={db.schema.views.length <= 1} style={{ alignSelf: "flex-start", color: "var(--danger)" }} onClick={() => void askConfirm({ title: `Apagar a view “${view.name}”?`, body: "Os dados do banco não mudam, só esta forma de ver." }).then((ok) => { if (!ok) return; db.saveSchema({ ...db.schema, views: db.schema.views.filter((v) => v.id !== view.id) }); setViewId(null); setRenaming(false); })}>Apagar view</button>
              </div>
            </Popover>)}</Presence>
          <button className="btn btn-pri btn-sm" type="button" style={{ marginLeft: "auto" }} onClick={() => void add()}><Icon name="plus" />Nova linha</button>
        </div>
      )}

      {db.status === "carregando" && <span className="sk" style={{ height: 180, borderRadius: 10, display: "block" }} aria-busy="true" aria-label="Carregando as linhas" />}
      {db.status === "erro" && (
        <div className="card" role="alert" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: "calc(14px * var(--fs, 1))" }}>Não foi possível carregar as linhas.</span>
          <button className="btn btn-sec btn-sm" type="button" onClick={db.reload} style={{ marginLeft: "auto" }}>Tentar de novo</button>
        </div>
      )}
      {db.status === "pronto" && viewProps && (
        <div className="enter" key={view!.id}>
          {view!.type === "table" && <TableView {...viewProps} />}
          {view!.type === "kanban" && <KanbanView {...viewProps} />}
          {view!.type === "list" && <ListView {...viewProps} />}
          {view!.type === "calendar" && <CalendarView {...viewProps} weekStart={weekStart} />}
          {db.rows.length > 0 && rows.length === 0 && <p className="muted" style={{ fontSize: "calc(14px * var(--fs, 1))", marginTop: 8 }}>Nenhuma linha passa pelos filtros desta view.</p>}
        </div>
      )}

      <Presence show={!!peek}>{peek && (<aside className="side-panel" aria-label="Linha" style={{ width: "min(640px, 100%)" }}>
          <div className="row" style={{ padding: "10px 12px", gap: 6, borderBottom: "1px solid var(--border)" }}>
            <a className="btn btn-fan btn-sm" href={`#/p/${peek}`}>Abrir como página</a>
            <button className="btn btn-fan btn-ico btn-sm" type="button" aria-label="Fechar" onClick={() => setPeek(null)} style={{ marginLeft: "auto" }}><Icon name="close" /></button>
          </div>
          <div style={{ flex: 1, overflow: "auto" }}>
            <PageView key={peek} pageId={peek} nodes={nodes} onToast={onToast} onSaved={(saved) => db.applySaved(saved)} onDelete={() => void remove(peek)} />
          </div>
        </aside>)}</Presence>
    </div>
  );
}
