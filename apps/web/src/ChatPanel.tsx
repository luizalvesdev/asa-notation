import { useCallback, useEffect, useRef, useState } from "react";
import { aiApi, chatApi } from "./api";
import { classifyChatError, describeDraft, describeResult, type ChatErrorKind } from "./chat-logic";
import { AGENTS, AGENT_HINT, AGENT_NAME, type Agent, type ChatMessage, type Conversation, type Draft } from "./chat-types";
import { Icon } from "./icons";
import { pageHash, routeHash } from "./nav";
import { formatAgo } from "./time-utils";
import type { Toast } from "./toast";

interface ChatPanelProps {
  /** Falso enquanto o painel está escondido (ele continua montado): não captura Esc nem foco. */
  active?: boolean;
  /** Agente e pergunta pedidos de fora (ex.: "Sessão guiada" em Estudo). A pergunta é enviada uma vez. */
  request?: { agent: Agent; prompt?: string; id: number } | null;
  onClose: () => void;
  onToast: (toast: Toast) => void;
  /** Depois de aprovar um rascunho que muda dados (ex.: cria página), para a árvore atualizar. */
  onDataChanged: () => void;
}

const AGENT_KEY = "asa.chat.agent";
const AVATAR: Record<Agent, string> = { hermes: "h", renato: "r", tutor: "t" };

function loadAgent(): Agent {
  try {
    const saved = localStorage.getItem(AGENT_KEY);
    return saved === "renato" || saved === "tutor" ? saved : "hermes";
  } catch {
    return "hermes";
  }
}

function DraftCard({ draft, agent, onChange, onDataChanged, onToast }: { draft: Draft; agent: Agent; onChange: (draft: Draft) => void; onDataChanged: () => void; onToast: (t: Toast) => void }) {
  const [busy, setBusy] = useState(false);
  const view = describeDraft(draft);

  const decide = async (kind: "approve" | "discard") => {
    setBusy(true);
    try {
      if (kind === "approve") {
        const res = await chatApi.approve(draft.id);
        onChange({ ...draft, status: "approved", result: res.result });
        if (draft.kind === "page") onDataChanged();
      } else {
        await chatApi.discard(draft.id);
        onChange({ ...draft, status: "discarded" });
      }
    } catch {
      onToast({ text: "Não foi possível concluir. O rascunho continua aqui." });
    } finally {
      setBusy(false);
    }
  };

  if (draft.status === "approved") {
    const pageId = typeof draft.result?.pageId === "string" ? draft.result.pageId : null;
    const link = pageId ? pageHash(pageId) : draft.kind === "tasks" ? routeHash("hoje") : routeHash("inbox");
    return (
      <div className="draft-ok enter">
        <svg className="ico" viewBox="0 0 24 24" aria-hidden="true" style={{ color: "var(--success)" }}><path d="M5 12.5l4.5 4.5L19 7" /></svg>
        {describeResult(draft)}
        <a className="btn btn-fan btn-sm" href={link} style={{ marginLeft: "auto" }}>Abrir</a>
      </div>
    );
  }
  if (draft.status === "discarded") return <div className="draft-ok enter" style={{ borderStyle: "dashed", color: "var(--text-2)" }}>Rascunho descartado</div>;

  return (
    <div className={`draft${agent === "renato" ? " r" : ""} rise`}>
      <span className="draft-t">{view.title}</span>
      <div className="col" style={{ gap: 4, fontSize: 13 }}>
        {view.lines.map((line, i) => <span key={i} style={{ overflowWrap: "anywhere" }}>{line}</span>)}
      </div>
      <div className="row" style={{ gap: 4 }}>
        <button className="btn btn-ink btn-sm" type="button" disabled={busy} onClick={() => void decide("approve")}>{view.approve}</button>
        <button className="btn btn-fan btn-sm" type="button" disabled={busy} onClick={() => void decide("discard")} style={{ color: "var(--text-2)" }}>Descartar</button>
      </div>
    </div>
  );
}

export function ChatPanel({ active = true, request, onClose, onToast, onDataChanged }: ChatPanelProps) {
  const [agent, setAgent] = useState<Agent>(() => request?.agent ?? loadAgent());
  const handled = useRef<number | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [history, setHistory] = useState<Conversation[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ kind: ChatErrorKind; message: string } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const current = useRef<Record<Agent, Conversation | null>>({ hermes: null, renato: null, tutor: null });

  useEffect(() => {
    let live = true;
    aiApi.status().then((s) => live && setConfigured(s.configured)).catch(() => live && setConfigured(false));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (active) field.current?.focus();
  }, [agent, showHistory, active]);

  useEffect(() => {
    body.current?.scrollTo({ top: body.current.scrollHeight });
  }, [messages, sending]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !showHistory && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, showHistory, active]);

  const switchAgent = (next: Agent) => {
    if (next === agent) return;
    try {
      localStorage.setItem(AGENT_KEY, next);
    } catch {
      // vale só nesta sessão
    }
    current.current[agent] = conversation;
    const saved = current.current[next];
    setAgent(next);
    setConversation(saved);
    setMessages([]);
    setError(null);
    setShowHistory(false);
    if (saved) void chatApi.open(saved.id).then((r) => setMessages(r.messages)).catch(() => undefined);
  };

  const openHistory = () => {
    setShowHistory((v) => !v);
    chatApi.conversations(agent).then(setHistory).catch(() => setHistory([]));
  };

  const open = (c: Conversation) => {
    setShowHistory(false);
    setConversation(c);
    setError(null);
    void chatApi.open(c.id).then((r) => setMessages(r.messages)).catch(() => onToast({ text: "Não foi possível abrir a conversa." }));
  };

  const send = useCallback(
    async (value: string) => {
      const message = value.trim();
      if (!message || sending) return;
      setSending(true);
      setError(null);
      setText("");
      setMessages((list) => [...list, { id: `tmp-${list.length}`, role: "user", text: message, createdAt: new Date().toISOString(), drafts: [] }]);
      try {
        const res = await chatApi.send(agent, message, conversation?.id ?? null);
        setConversation(res.conversation);
        setMessages(res.messages);
      } catch (err) {
        const failure = classifyChatError(err);
        setError(failure);
        if (failure.kind === "no_key" || failure.kind === "invalid_key") setConfigured(failure.kind === "invalid_key");
        // A mensagem não foi: devolve o texto ao campo para tentar de novo.
        setMessages((list) => list.filter((m) => !m.id.startsWith("tmp-")));
        setText(message);
      } finally {
        setSending(false);
      }
    },
    [agent, conversation, sending],
  );

  // Pedido de fora: troca de agente e, se veio uma pergunta, envia depois de saber se há chave.
  useEffect(() => {
    if (!request || handled.current === request.id || configured === null) return;
    handled.current = request.id;
    if (request.agent !== agent) switchAgent(request.agent);
    if (request.prompt && configured) void send(request.prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, configured]);

  const updateDraft = (messageId: string, draft: Draft) =>
    setMessages((list) => list.map((m) => (m.id === messageId ? { ...m, drafts: m.drafts.map((d) => (d.id === draft.id ? draft : d)) } : m)));

  const newConversation = () => {
    setConversation(null);
    current.current[agent] = null;
    setMessages([]);
    setError(null);
    setShowHistory(false);
  };

  const name = AGENT_NAME[agent];
  return (
    <aside className="chat" aria-label="Assistentes">
      <div className="chat-h">
        <div className="seg" role="tablist" aria-label="Assistente" style={{ width: 280 }}>
          <span className="seg-ind" style={{ width: "calc((100% - 4px) / 3)", transform: `translateX(${AGENTS.indexOf(agent) * 100}%)` }} />
          {AGENTS.map((a) => (
            <button key={a} className={`seg-b${agent === a ? " on" : ""}`} type="button" role="tab" aria-selected={agent === a} onClick={() => switchAgent(a)}>
              <span className={`av ${AVATAR[a]}`} style={{ width: 16, height: 16, fontSize: 10, borderRadius: 4 }}>{AGENT_NAME[a][0]}</span>
              {AGENT_NAME[a]}
            </button>
          ))}
        </div>
        <div className="row" style={{ marginLeft: "auto", gap: 2 }}>
          <button className="btn btn-fan btn-ico btn-sm" type="button" aria-label="Nova conversa" onClick={newConversation}><Icon name="plus" /></button>
          <button className={`btn btn-fan btn-ico btn-sm${showHistory ? " on" : ""}`} type="button" aria-label="Histórico de conversas" aria-pressed={showHistory} onClick={openHistory}>
            <svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></svg>
          </button>
          <button className="btn btn-fan btn-ico btn-sm" type="button" aria-label="Fechar painel (esc)" onClick={onClose}><Icon name="close" /></button>
        </div>
      </div>

      {showHistory ? (
        <div className="chat-body enter" style={{ gap: 4 }}>
          <div className="eyebrow" style={{ padding: "0 6px 6px" }}>Conversas com {name}</div>
          {history === null && <span className="sk" style={{ height: 14, display: "block" }} aria-label="Carregando as conversas" />}
          {history?.length === 0 && <span style={{ fontSize: 13, color: "var(--text-2)", padding: "0 6px" }}>Nenhuma conversa ainda.</span>}
          {history?.map((c) => (
            <div key={c.id} className="row" style={{ gap: 2 }}>
              <button className="plain mrow grow1" type="button" onClick={() => open(c)} style={{ height: "auto", padding: 8, alignItems: "flex-start", flexDirection: "column", gap: 2, textAlign: "left" }}>
                <span className="trunc" style={{ fontWeight: 500, fontSize: 13, maxWidth: "100%" }}>{c.title || "Sem título"}</span>
                <span style={{ fontSize: 12, color: "var(--text-3)" }}>{formatAgo(c.updatedAt)}</span>
              </button>
              <button className="btn btn-fan btn-ico btn-sm" type="button" aria-label={`Apagar a conversa ${c.title}`} onClick={() => void chatApi.remove(c.id).then(() => { setHistory((h) => h?.filter((x) => x.id !== c.id) ?? null); if (conversation?.id === c.id) newConversation(); }).catch(() => onToast({ text: "Não foi possível apagar." }))}><Icon name="trash" /></button>
            </div>
          ))}
        </div>
      ) : (
        <div className="chat-body" ref={body} aria-live="polite">
          {configured === false && messages.length === 0 && (
            <div className="card enter" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              <b style={{ fontWeight: 600, fontSize: 14 }}>Conecte uma chave de IA</b>
              <span style={{ fontSize: 13, color: "var(--text-2)", lineHeight: "19px" }}>Hermes e Renato usam o Claude com a sua chave. Ela fica cifrada no servidor e você pode removê-la quando quiser.</span>
              <a className="btn btn-pri btn-sm" href={routeHash("configuracoes")} style={{ alignSelf: "flex-start" }} onClick={onClose}>Abrir configurações</a>
            </div>
          )}
          {configured !== false && messages.length === 0 && (
            <div className="col enter" style={{ gap: 10 }}>
              <div className="bub-a">
                <span className={`av ${AVATAR[agent]}`}>{name[0]}</span>
                <span>{agent === "hermes" ? "Oi! Eu cuido da sua rotina, tarefas e metas." : agent === "renato" ? "Oi! Eu cuido das suas capturas e notas." : "Oi! Eu ajudo você a aprender com perguntas, a partir dos seus cards e notas."} O que vamos fazer?</span>
              </div>
              <div className="col" style={{ gap: 6, paddingLeft: 32 }}>
                {AGENT_HINT[agent].map((hint) => (
                  <button key={hint} className="btn btn-sec btn-sm" type="button" disabled={sending || configured === null} onClick={() => void send(hint)} style={{ alignSelf: "flex-start", textAlign: "left", height: "auto", minHeight: 28, padding: "4px 10px" }}>{hint}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="bub-u" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.text}</div>
            ) : (
              <div key={m.id} className="bub-a">
                <span className={`av ${AVATAR[agent]}`}>{name[0]}</span>
                <div className="col" style={{ gap: 10, minWidth: 0, flex: 1 }}>
                  {m.text && <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.text}</div>}
                  {m.drafts.map((d) => <DraftCard key={d.id} draft={d} agent={agent} onChange={(next) => updateDraft(m.id, next)} onDataChanged={onDataChanged} onToast={onToast} />)}
                </div>
              </div>
            ),
          )}
          {sending && (
            <div className="bub-a" aria-label={`${name} está respondendo`}>
              <span className={`av ${AVATAR[agent]}`}>{name[0]}</span>
              <span className={agent === "renato" ? "rcaret" : "hcaret"} />
            </div>
          )}
          {error && (
            <div className="draft-ok enter" role="alert" style={{ background: "var(--warning-soft)", borderColor: "transparent", color: "var(--warning)", flexWrap: "wrap" }}>
              <span>{error.message}</span>
              {(error.kind === "no_key" || error.kind === "invalid_key") && <a className="btn btn-fan btn-sm" href={routeHash("configuracoes")} onClick={onClose} style={{ color: "inherit" }}>Configurações</a>}
            </div>
          )}
        </div>
      )}

      <form className="chat-f" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
          <textarea
            ref={field}
            className="inp"
            rows={2}
            value={text}
            placeholder={`Fale com ${name}…`}
            aria-label={`Mensagem para ${name}`}
            disabled={configured === false}
            maxLength={4000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(text);
              }
            }}
          />
          <button className="btn btn-pri btn-sm" type="submit" disabled={sending || text.trim() === "" || configured === false}>Enviar</button>
        </div>
        <span style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6, display: "block" }}>{agent === "tutor" ? `${name} só conversa e lê suas notas: não altera nada.` : `${name} só faz rascunhos: nada é criado sem a sua aprovação.`} Enter envia, Shift+Enter quebra a linha.</span>
      </form>
    </aside>
  );
}
