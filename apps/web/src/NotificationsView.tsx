import { useCallback, useEffect, useState } from "react";
import { notificationsApi } from "./api";
import { Icon } from "./icons";
import type { Notification } from "./routine-types";
import { groupNotifications } from "./routine-logic";
import { formatAgo } from "./time-utils";
import type { Toast } from "./toast";
import { ContextBox } from "./ContextBox";

interface NotificationsViewProps {
  onChanged: () => void;
  onToast: (toast: Toast) => void;
}

type Permission = "default" | "granted" | "denied" | "unsupported";

const permission = (): Permission => (typeof Notification === "undefined" ? "unsupported" : Notification.permission);

export function NotificationsView({ onChanged, onToast }: NotificationsViewProps) {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [state, setState] = useState<{ status: "carregando" | "erro" | "pronto"; items: Notification[]; unread: number }>({ status: "carregando", items: [], unread: 0 });
  const [perm, setPerm] = useState<Permission>(permission);
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(() => {
    notificationsApi
      .list(filter)
      .then((data) => setState({ status: "pronto", items: data.items, unread: data.unread }))
      .catch(() => setState((s) => (s.status === "pronto" ? s : { ...s, status: "erro" })));
  }, [filter]);

  useEffect(() => {
    setState((s) => ({ ...s, status: s.items.length > 0 ? s.status : "carregando" }));
    load();
  }, [load, attempt]);

  const toggleRead = async (n: Notification) => {
    setState((s) => ({ ...s, items: s.items.map((i) => (i.id === n.id ? { ...i, read: !n.read } : i)), unread: s.unread + (n.read ? 1 : -1) }));
    try {
      await notificationsApi.setRead(n.id, !n.read);
      onChanged();
    } catch {
      onToast({ text: "Não foi possível atualizar a notificação." });
      load();
    }
  };

  const readAll = async () => {
    try {
      await notificationsApi.readAll();
      onChanged();
      load();
    } catch {
      onToast({ text: "Não foi possível marcar como lidas." });
    }
  };

  const enable = async () => {
    if (typeof Notification === "undefined") return;
    setPerm((await Notification.requestPermission()) as Permission);
  };

  const groups = groupNotifications(state.items);
  const ready = state.status === "pronto";

  return (
    <div className="screen" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="screen-head" style={{ marginBottom: 8, alignItems: "center" }}>
        <h1 className="screen-title">Notificações</h1>
        <div className="seg" role="tablist" aria-label="Filtro" style={{ marginLeft: "auto" }}>
          <span className="seg-ind" style={{ width: "calc((100% - 4px) / 2)", transform: `translateX(${filter === "all" ? 0 : 100}%)` }} />
          <button className={`seg-b${filter === "all" ? " on" : ""}`} type="button" role="tab" aria-selected={filter === "all"} onClick={() => setFilter("all")}>Todas</button>
          <button className={`seg-b${filter === "unread" ? " on" : ""}`} type="button" role="tab" aria-selected={filter === "unread"} onClick={() => setFilter("unread")}>Não lidas · {state.unread}</button>
        </div>
        <button className="btn btn-fan btn-sm" type="button" disabled={state.unread === 0} onClick={() => void readAll()}>Marcar todas como lidas</button>
      </div>

      {perm === "default" && (
        <div className="card enter" style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ width: 32, height: 32, borderRadius: 8, background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="bell" /></span>
          <span className="col grow1" style={{ minWidth: 220 }}>
            <b style={{ fontWeight: 600, fontSize: "calc(14px * var(--fs, 1))" }}>Avisos do sistema neste dispositivo?</b>
            <span style={{ fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-2)" }}>Com a permissão, o app avisa quando chega um check-in e a aba está em segundo plano. Funciona com o app aberto.</span>
          </span>
          <button className="btn btn-pri btn-sm" type="button" onClick={() => void enable()}>Ativar</button>
        </div>
      )}
      {perm === "granted" && (
        <div className="draft-ok enter">
          <svg className="ico" viewBox="0 0 24 24" aria-hidden="true" style={{ color: "var(--success)" }}><path d="M5 12.5l4.5 4.5L19 7" /></svg>
          Avisos do sistema ativos neste dispositivo.
          <button className="btn btn-fan btn-sm" type="button" style={{ marginLeft: "auto" }} onClick={() => { try { new Notification("asa-notation", { body: "Notificação de teste" }); } catch { onToast({ text: "Este navegador não permite o teste." }); } }}>Enviar teste</button>
        </div>
      )}
      {perm === "denied" && (
        <div className="draft-ok enter" style={{ background: "var(--warning-soft)", borderColor: "transparent", color: "var(--warning)" }}>
          Bloqueadas no navegador. Libere nas configurações do site para receber avisos.
        </div>
      )}

      {state.status === "carregando" && (
        <div className="col" style={{ gap: 8 }} aria-busy="true" aria-label="Carregando as notificações">
          {[0, 1, 2].map((i) => <span key={i} className="sk" style={{ height: 70, borderRadius: 10 }} />)}
        </div>
      )}
      {state.status === "erro" && (
        <div className="card" role="alert" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: "calc(14px * var(--fs, 1))" }}>Não foi possível carregar as notificações.</span>
          <button className="btn btn-sec btn-sm" type="button" onClick={() => setAttempt((a) => a + 1)} style={{ marginLeft: "auto" }}>Tentar de novo</button>
        </div>
      )}

      {ready && (
        <div className="col" style={{ gap: 2 }}>
          {groups.map((g) => (
            <div key={g.name} className="col" style={{ gap: 2 }}>
              <div className="eyebrow" style={{ padding: "14px 4px 6px" }}>{g.name}</div>
              {g.items.map((n) => (
                <ContextBox
                  key={n.id}
                  items={() => [
                    ...(n.link ? [{ label: "Abrir", run: () => { if (!n.read) void toggleRead(n); location.hash = n.link!.replace(/^#?/, "#"); } }] : []),
                    { label: n.read ? "Marcar como não lida" : "Marcar como lida", run: () => void toggleRead(n) },
                  ]}
                  className="enter"
                  style={{ display: "flex", gap: 12, padding: 12, borderRadius: 10, background: n.read ? "transparent" : "var(--accent-soft)" }}
                >
                  <span className="av h">H</span>
                  <div className="col grow1" style={{ gap: 4, minWidth: 0 }}>
                    <span className="row" style={{ gap: 8 }}>
                      <b className="trunc" style={{ fontWeight: 600, fontSize: "calc(14px * var(--fs, 1))" }}>{n.title}</b>
                      {!n.read && <span className="dot" style={{ background: "var(--accent)" }} aria-label="não lida" />}
                      <span style={{ marginLeft: "auto", fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-3)", whiteSpace: "nowrap" }}>{formatAgo(n.createdAt)}</span>
                    </span>
                    <span style={{ fontSize: "calc(13px * var(--fs, 1))", lineHeight: "calc(19px * var(--fs, 1))", color: "var(--text-2)" }}>{n.body}</span>
                    <span className="row" style={{ gap: 4, marginTop: 2 }}>
                      {n.link && <a className="btn btn-sec btn-sm" href={n.link} onClick={() => !n.read && void toggleRead(n)}>Abrir</a>}
                      <button className="btn btn-fan btn-sm" type="button" onClick={() => void toggleRead(n)} style={{ color: "var(--text-2)" }}>{n.read ? "Marcar como não lida" : "Marcar como lida"}</button>
                    </span>
                  </div>
                </ContextBox>
              ))}
            </div>
          ))}
          {state.items.length === 0 && (
            <div className="col enter" style={{ alignItems: "center", gap: 6, padding: 40, textAlign: "center", color: "var(--text-2)" }}>
              <b style={{ fontWeight: 600, color: "var(--text)" }}>{filter === "unread" ? "Tudo lido" : "Nada por aqui"}</b>
              <span style={{ fontSize: "calc(13px * var(--fs, 1))" }}>Novos check-ins e avisos aparecem aqui.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
