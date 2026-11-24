import { DEMO, DEMO_AI_OFF } from "./demo-flag";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ApiError, accountApi, aiApi, pushApi, settingsApi, tokensApi, type PushDevice } from "./api";
import { currentSubscription, disablePush, enablePush, pushSupport } from "./push-client";
import { downloadFile } from "./download";
import { buildMarkdownZip } from "./export-zip";
import { routeHash } from "./nav";
import { removePending, usePending } from "./outbox";
import { canInstall, isStandalone, onInstallChange, promptInstall } from "./pwa";
import { TimePicker } from "./TimePicker";
import { DEFAULT_SETTINGS, type ApiToken, type CustomCheckin, type Settings } from "./settings-types";
import { loadReduceMotion, applyReduceMotion, type Preference } from "./theme";
import { TEXT_SIZES, applyTextSize, loadTextSize, type TextSize } from "./text-size";
import { formatAgo } from "./time-utils";
import type { Toast } from "./toast";
import { loadReviewOnOpen, saveReviewOnOpen } from "./review-on-open";
import { loadTypedAnswers, saveTypedAnswers } from "./typed-answer";
import { Reveal } from "./Reveal";
import { askConfirm } from "./confirm";

interface SettingsViewProps {
  /** Aba pedida pelo endereço (`#/configuracoes/rotina`). */
  sub?: string | undefined;
  preference: Preference;
  onPreference: (preference: Preference) => void;
  onLogout: () => void;
  onToast: (toast: Toast) => void;
}

const ALL_TABS = ["Geral", "Rotina", "Assistentes", "API", "Dados", "Aplicativo", "Conta"] as const;
type Tab = (typeof ALL_TABS)[number];
// Na demo não há conta, tokens de API nem MCP.
const TABS = DEMO ? ALL_TABS.filter((t) => t !== "API" && t !== "Conta") : ALL_TABS;

function useSettings(onToast: (t: Toast) => void) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    settingsApi
      .get()
      .then((s) => live && setSettings(s))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  const save = useCallback(
    async (patch: Parameters<typeof settingsApi.patch>[0]) => {
      try {
        setSettings(await settingsApi.patch(patch));
        return true;
      } catch {
        onToast({ text: "Não foi possível salvar a configuração." });
        return false;
      }
    },
    [onToast],
  );
  return { settings, failed, save };
}

function Segment<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className="seg" role="radiogroup" aria-label={label} style={{ width: 360, maxWidth: "100%" }}>
      <span className="seg-ind" style={{ width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(${index * 100}%)` }} />
      {options.map((o) => (
        <button key={String(o.value)} className={`seg-b${o.value === value ? " on" : ""}`} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function TimeField({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  return <TimePicker label={label} value={value} onChange={(v) => v && v !== value && onSave(v)} />;
}

function General({ settings, save, preference, onPreference }: { settings: Settings; save: ReturnType<typeof useSettings>["save"]; preference: Preference; onPreference: (p: Preference) => void }) {
  const [tz, setTz] = useState(settings.timezone);
  const [tzError, setTzError] = useState(false);
  const [reduce, setReduce] = useState(loadReduceMotion);
  const [textSize, setTextSize] = useState<TextSize>(loadTextSize);
  const [reviewOnOpen, setReviewOnOpen] = useState(loadReviewOnOpen);
  const [typedAnswers, setTypedAnswers] = useState(loadTypedAnswers);
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];

  return (
    <div className="col enter" style={{ gap: 20 }}>
      <div className="col" style={{ gap: 8 }}>
        <span className="label">Tema</span>
        <Segment label="Tema" value={preference} onChange={onPreference} options={[{ value: "claro", label: "Claro" }, { value: "escuro", label: "Escuro" }, { value: "sistema", label: "Sistema" }]} />
        <span className="help">“Sistema” segue a preferência do dispositivo.</span>
      </div>
      <div className="col" style={{ gap: 8 }}>
        <span className="label">Tamanho do texto</span>
        <Segment label="Tamanho do texto" value={textSize} onChange={(v) => { setTextSize(v); applyTextSize(v); }} options={TEXT_SIZES.map((s) => ({ value: s.value, label: s.label }))} />
        <span className="help">Vale só para este aparelho: o celular e o computador podem ter tamanhos diferentes.</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))", gap: 14 }}>
        <div className="field">
          <label className="label" htmlFor="tz">Fuso horário</label>
          <input id="tz" className={`inp${tzError ? " err" : ""}`} list="zones" value={tz} onChange={(e) => { setTz(e.target.value); setTzError(false); }} onBlur={() => { if (tz !== settings.timezone) void save({ timezone: tz }).then((ok) => { if (!ok) { setTzError(true); } }); }} />
          <datalist id="zones">{zones.map((z) => <option key={z} value={z} />)}</datalist>
          <span className="help" style={tzError ? { color: "var(--danger)" } : undefined}>{tzError ? "Fuso não reconhecido. Use o formato America/Sao_Paulo." : "Usado em check-ins, lembretes e datas."}</span>
        </div>
        <div className="field">
          <span className="label">Semana começa em</span>
          <Segment label="Semana começa em" value={settings.weekStart} onChange={(v) => void save({ weekStart: v })} options={[{ value: 1, label: "Segunda" }, { value: 0, label: "Domingo" }]} />
        </div>
      </div>
      <button className="tog" type="button" role="switch" aria-checked={reduce} onClick={() => { const next = !reduce; setReduce(next); applyReduceMotion(next); }} style={{ padding: 0, color: "var(--text)", justifyContent: "space-between", maxWidth: 520, height: "auto", minHeight: 40 }}>
        <span className="col" style={{ textAlign: "left" }}>
          <span>Reduzir movimento</span>
          <span style={{ fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-3)", fontWeight: 400 }}>Troca deslocamentos por opacidade. Também segue o sistema.</span>
        </span>
        <span className={`sw${reduce ? " on" : ""}`}><span className="knob" /></span>
      </button>
      <button className="tog" type="button" role="switch" aria-checked={reviewOnOpen} onClick={() => { const next = !reviewOnOpen; setReviewOnOpen(next); saveReviewOnOpen(next); }} style={{ padding: 0, color: "var(--text)", justifyContent: "space-between", maxWidth: 520, height: "auto", minHeight: 40 }}>
        <span className="col" style={{ textAlign: "left" }}>
          <span>Abrir a revisão ao entrar</span>
          <span style={{ fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-3)", fontWeight: 400 }}>Se há cards para hoje, o app abre direto neles. Vale só para este aparelho.</span>
        </span>
        <span className={`sw${reviewOnOpen ? " on" : ""}`}><span className="knob" /></span>
      </button>
      <button className="tog" type="button" role="switch" aria-checked={typedAnswers} onClick={() => { const next = !typedAnswers; setTypedAnswers(next); saveTypedAnswers(next); }} style={{ padding: 0, color: "var(--text)", justifyContent: "space-between", maxWidth: 520, height: "auto", minHeight: 40 }}>
        <span className="col" style={{ textAlign: "left" }}>
          <span>Responder os cards digitando</span>
          <span style={{ fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-3)", fontWeight: 400 }}>O Asa confere a resposta e sugere a nota pelo tempo que você levou para lembrar. Vale só para este aparelho; no celular começa desligado.</span>
        </span>
        <span className={`sw${typedAnswers ? " on" : ""}`}><span className="knob" /></span>
      </button>
    </div>
  );
}

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const WEEKDAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** Check-ins do próprio usuário: título, horário e dias da semana (sem dia marcado = todo dia). */
function CustomCheckins({ settings, save }: { settings: Settings; save: ReturnType<typeof useSettings>["save"] }) {
  const items = settings.customCheckins;
  const update = (id: string, patch: Partial<CustomCheckin>) => void save({ customCheckins: items.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const add = () => void save({ customCheckins: [...items, { id: crypto.randomUUID(), title: "Novo check-in", time: "12:00", days: [], enabled: true }] });
  return (
    <div className="col" style={{ marginTop: 18 }}>
      <span className="label" style={{ marginBottom: 6 }}>Seus check-ins</span>
      {items.length === 0 && <span className="help" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>Nenhum ainda. Crie um aviso com o texto e o horário que quiser, por exemplo "Beber água" às 15:00.</span>}
      {items.map((c) => (
        <div key={c.id} className="row" style={{ gap: 10, minHeight: 56, borderTop: "1px solid var(--border)", flexWrap: "wrap", padding: "6px 0" }}>
          <button className="tog" type="button" role="switch" aria-checked={c.enabled} aria-label={`Ligar ${c.title}`} onClick={() => update(c.id, { enabled: !c.enabled })} style={{ padding: "0 4px" }}>
            <span className={`sw${c.enabled ? " on" : ""}`}><span className="knob" /></span>
          </button>
          <TextField label="Título do check-in" value={c.title} onSave={(v) => update(c.id, { title: v })} />
          <span className="row" style={{ gap: 4 }} role="group" aria-label="Dias da semana">
            {WEEKDAYS.map((letter, day) => {
              const on = c.days.includes(day);
              return (
                <button key={day} className={`btn btn-sm ${on ? "btn-pri" : "btn-fan"}`} type="button" aria-pressed={on} aria-label={WEEKDAY_NAMES[day]} title={WEEKDAY_NAMES[day]} onClick={() => update(c.id, { days: on ? c.days.filter((d) => d !== day) : [...c.days, day].sort() })} style={{ width: 30, padding: 0 }}>
                  {letter}
                </button>
              );
            })}
          </span>
          <span className="badge out">{c.days.length === 0 ? "todo dia" : c.days.length === 7 ? "todo dia" : c.days.map((d) => WEEKDAY_NAMES[d]!.slice(0, 3)).join(", ")}</span>
          <TimeField label={`Horário de ${c.title}`} value={c.time} onSave={(v) => update(c.id, { time: v })} />
          <button className="btn btn-fan btn-sm" type="button" aria-label={`Apagar ${c.title}`} onClick={() => void askConfirm({ title: `Apagar “${c.title}”?`, body: "O aviso deixa de chegar.", confirmLabel: "Apagar" }).then((ok) => ok && void save({ customCheckins: items.filter((x) => x.id !== c.id) }))}>Apagar</button>
        </div>
      ))}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        <button className="btn btn-sec btn-sm" type="button" disabled={items.length >= 20} onClick={add}>+ Novo check-in</button>
      </div>
    </div>
  );
}

function TextField({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className="inp grow1"
      aria-label={label}
      value={draft}
      maxLength={80}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => (draft.trim() && draft.trim() !== value ? onSave(draft.trim()) : setDraft(value))}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      style={{ minWidth: 160 }}
    />
  );
}

function Routine({ settings, save }: { settings: Settings; save: ReturnType<typeof useSettings>["save"] }) {
  const rows: { label: string; badge: string; aria: string; key: "plan" | "thursday" | "saturday" | "study" }[] = [
    { label: "Plano do dia", badge: "todo dia", aria: "Horário do plano do dia", key: "plan" },
    { label: "Métricas da quinta", badge: "quinta", aria: "Horário das métricas", key: "thursday" },
    { label: "Revisão do sábado", badge: "sábado", aria: "Horário da revisão", key: "saturday" },
    { label: "Lembrete de estudo", badge: "se houver cards", aria: "Horário do lembrete de estudo", key: "study" },
  ];
  return (
    <div className="col enter">
      <span className="label" style={{ marginBottom: 6 }}>Horários dos check-ins do Hermes</span>
      {rows.map((r) => (
        <div key={r.key} className="row" style={{ gap: 12, minHeight: 52, borderTop: "1px solid var(--border)" }}>
          <span className="grow1">{r.label}</span>
          <span className="badge out">{r.badge}</span>
          <TimeField label={r.aria} value={settings.checkins[r.key]} onSave={(v) => void save({ checkins: { [r.key]: v } })} />
        </div>
      ))}
      <div className="row" style={{ gap: 12, minHeight: 52, borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
        <span className="grow1">Silêncio</span>
        <span className="help">sem notificações</span>
        <TimeField label="Início do silêncio" value={settings.quiet.start} onSave={(v) => void save({ quiet: { start: v } })} />
        <span>até</span>
        <TimeField label="Fim do silêncio" value={settings.quiet.end} onSave={(v) => void save({ quiet: { end: v } })} />
      </div>
      <CustomCheckins settings={settings} save={save} />
    </div>
  );
}

function AutoApply({ settings, save }: { settings: Settings; save: (patch: Parameters<typeof settingsApi.patch>[0]) => Promise<boolean> }) {
  const on = settings.aiAutoApply;
  return (
    <button className="tog" type="button" role="switch" aria-checked={on} onClick={() => void save({ aiAutoApply: !on })} style={{ padding: 0, color: "var(--text)", justifyContent: "space-between", maxWidth: 560, height: "auto", minHeight: 40 }}>
      <span className="col" style={{ textAlign: "left" }}>
        <span>Executar sem pedir aprovação</span>
        <span style={{ fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-3)", fontWeight: 400 }}>Hermes e Renato criam e editam na hora, e dizem o que fizeram. Apagar e reescrever uma página inteira sempre pedem o seu OK.</span>
      </span>
      <span className={`sw${on ? " on" : ""}`}><span className="knob" /></span>
    </button>
  );
}

type AiStatus = { provider: "anthropic" | "bedrock"; configured: boolean; last4: string | null; model: string; autoApply?: boolean };

function Assistants({ onToast, settings, save: saveSettings }: { onToast: (t: Toast) => void; settings: Settings | null; save: (patch: Parameters<typeof settingsApi.patch>[0]) => Promise<boolean> }) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    let live = true;
    aiApi.status().then((s) => live && setStatus(s)).catch(() => live && setStatus({ provider: "anthropic", configured: false, last4: null, model: "" }));
    return () => {
      live = false;
    };
  }, []);

  const save = async () => {
    if (busy || key.trim() === "") return;
    setBusy(true);
    setError(null);
    try {
      const res = await aiApi.setKey(key.trim());
      setStatus((s) => ({ provider: "anthropic", configured: true, last4: res.last4, model: s?.model ?? "" }));
      setKey("");
      onToast({ text: "Chave testada e salva" });
    } catch (err) {
      const code = err instanceof ApiError && typeof err.body === "object" && err.body !== null ? (err.body as { error?: string }).error : undefined;
      setError(code === "key_rejected" ? "O provedor recusou esta chave." : code === "invalid_key" ? "Formato de chave inválido." : err instanceof ApiError && err.status === 429 ? "Limite de uso do provedor. Tente daqui a pouco." : "Não foi possível testar a chave agora.");
    } finally {
      setBusy(false);
    }
  };

  if (status?.provider === "bedrock") {
    return (
      <div className="col enter" style={{ gap: 14 }}>
        {settings && <AutoApply settings={settings} save={saveSettings} />}
        <p className="muted" style={{ fontSize: "calc(14px * var(--fs, 1))" }}>Os assistentes usam o Claude pelo Amazon Bedrock. O acesso é do servidor (papel IAM), então não há chave para cadastrar aqui.</p>
        <div className="card" style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span className="col grow1" style={{ minWidth: 200 }}>
            <b style={{ fontWeight: 600, fontSize: "calc(14px * var(--fs, 1))" }}>Amazon Bedrock</b>
            <span className="mono" style={{ fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-2)", overflowWrap: "anywhere" }}>{status.model}</span>
          </span>
          <span className="badge ok">gerenciado pelo servidor</span>
        </div>
      </div>
    );
  }

  return (
    <div className="col enter" style={{ gap: 14 }}>
      {settings && <AutoApply settings={settings} save={saveSettings} />}
      <p className="muted" style={{ fontSize: "calc(14px * var(--fs, 1))" }}>Hermes e Renato usam o Claude (Anthropic) com a sua chave. Ela fica cifrada no servidor e nunca volta inteira para a tela.</p>
      {status?.configured && (
        <div className="card" style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span className="col grow1" style={{ minWidth: 200 }}>
            <b style={{ fontWeight: 600, fontSize: "calc(14px * var(--fs, 1))" }}>Anthropic</b>
            <span className="mono" style={{ fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-2)" }}>••••••••{status.last4}</span>
          </span>
          <span className="badge ok">ativa</span>
          {confirm ? (
            <button className="btn btn-sec btn-sm" type="button" onClick={() => void aiApi.removeKey().then(() => { setStatus({ provider: "anthropic", configured: false, last4: null, model: status.model }); setConfirm(false); }).catch(() => onToast({ text: "Não foi possível remover." }))}>Confirmar remoção</button>
          ) : (
            <button className="btn btn-fan btn-sm" type="button" style={{ color: "var(--danger)" }} onClick={() => void askConfirm({ title: "Remover a chave da Anthropic?", body: "Os assistentes param de funcionar até você adicionar outra.", confirmLabel: "Remover" }).then((ok) => { if (ok) void aiApi.removeKey().then(() => setStatus({ provider: "anthropic", configured: false, last4: null, model: status.model })).catch(() => onToast({ text: "Não foi possível remover." })); })}>Remover</button>
          )}
        </div>
      )}
      <form className="field" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <label className="label" htmlFor="ai-key">{status?.configured ? "Trocar a chave" : "Adicionar chave"}</label>
        <div className="row" style={{ gap: 8 }}>
          <input id="ai-key" className="inp mono" type="password" autoComplete="off" spellCheck={false} placeholder="Cole a chave do provedor" value={key} onChange={(e) => setKey(e.target.value)} />
          <button className="btn btn-pri" type="submit" disabled={busy || key.trim() === ""}>{busy ? "Testando…" : "Testar e salvar"}</button>
        </div>
        <span className="help" style={error ? { color: "var(--danger)" } : undefined} role={error ? "alert" : undefined}>{error ?? "Testamos a chave com uma chamada mínima antes de salvar."}</span>
      </form>
      {status?.model && <span className="help">Modelo: {status.model}</span>}
    </div>
  );
}

function Tokens({ onToast }: { onToast: (t: Toast) => void }) {
  const [tokens, setTokens] = useState<ApiToken[] | null>(null);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"read" | "write">("read");
  const [secret, setSecret] = useState<{ name: string; value: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    tokensApi.list().then(setTokens).catch(() => setTokens([]));
  }, []);
  useEffect(load, [load]);

  const create = async () => {
    if (name.trim() === "") return;
    try {
      const res = await tokensApi.create(name.trim(), scope);
      setSecret({ name: res.token.name, value: res.secret });
      setName("");
      setCopied(false);
      load();
    } catch {
      onToast({ text: "Não foi possível criar o token." });
    }
  };

  return (
    <div className="col enter" style={{ gap: 14 }}>
      <p className="muted" style={{ fontSize: "calc(14px * var(--fs, 1))" }}>Tokens para scripts e integrações acessarem suas páginas pela API (cabeçalho <code>Authorization: Bearer …</code>). Token não altera senha, configurações nem outros tokens.</p>
      <Reveal show={!!secret}>{secret && (<div className="draft-ok enter" role="status" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
          <b style={{ fontWeight: 600 }}>Token “{secret.name}” criado. Copie agora: ele não aparece de novo.</b>
          <div className="row" style={{ gap: 8 }}>
            <input className="inp mono" readOnly value={secret.value} aria-label="Token novo" onFocus={(e) => e.currentTarget.select()} />
            <button className="btn btn-sec btn-sm" type="button" onClick={() => void navigator.clipboard.writeText(secret.value).then(() => setCopied(true)).catch(() => onToast({ text: "Não foi possível copiar. Selecione o texto." }))}>{copied ? "Copiado" : "Copiar"}</button>
            <button className="btn btn-fan btn-sm" type="button" onClick={() => setSecret(null)}>Fechar</button>
          </div>
        </div>)}</Reveal>
      <div className="dgrid card tokens" role="table" aria-label="Tokens" style={{ ["--cols" as string]: "minmax(0, 1.3fr) 140px 130px 150px", overflow: "hidden" }}>
        <div className="drow hd" role="row"><span role="columnheader">Nome</span><span role="columnheader">Escopo</span><span role="columnheader">Último uso</span><span role="columnheader" /></div>
        {tokens === null && <div className="drow" role="row"><span className="sk" style={{ height: 14, margin: "0 10px" }} /></div>}
        {tokens?.length === 0 && <div className="drow" role="row"><span style={{ color: "var(--text-3)" }}>Nenhum token ainda.</span></div>}
        {tokens?.map((t) => (
          <div key={t.id} className="drow" role="row">
            <span>{t.name}</span>
            <span><span className="badge out">{t.scope === "read" ? "leitura" : "leitura e escrita"}</span></span>
            <span style={{ color: "var(--text-2)" }}>{t.lastUsedAt ? formatAgo(t.lastUsedAt) : "nunca"}</span>
            <span style={{ textAlign: "right" }}>
              {confirm === t.id ? (
                <button className="btn btn-sm btn-sec" type="button" onClick={() => void tokensApi.revoke(t.id).then(() => { setConfirm(null); load(); }).catch(() => onToast({ text: "Não foi possível revogar." }))}>Confirmar</button>
              ) : (
                <button className="btn btn-fan btn-sm" type="button" style={{ color: "var(--danger)" }} onClick={() => void askConfirm({ title: `Revogar o token “${t.name}”?`, body: "O que usa esse token (extensão, Claude, scripts) para de acessar o Asa na hora.", confirmLabel: "Revogar" }).then((ok) => { if (ok) void tokensApi.revoke(t.id).then(() => load()).catch(() => onToast({ text: "Não foi possível revogar." })); })}>Revogar</button>
              )}
            </span>
          </div>
        ))}
      </div>
      <form className="row" style={{ gap: 8, flexWrap: "wrap" }} onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <input className="inp" style={{ width: 240 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do token (ex.: script de backup)" aria-label="Nome do token" />
        <select className="inp" style={{ width: "auto" }} value={scope} onChange={(e) => setScope(e.target.value as "read" | "write")} aria-label="Escopo">
          <option value="read">Leitura</option>
          <option value="write">Leitura e escrita</option>
        </select>
        <button className="btn btn-sec" type="submit" disabled={name.trim() === ""}>Novo token</button>
      </form>
      <McpHelp />
      <ExtensionHelp />
    </div>
  );
}

/** Como ligar o Claude Code e o Claude Desktop às notas pelo servidor MCP do app. */
function McpHelp() {
  const url = `${location.origin}/api/mcp`;
  const code = `claude mcp add --transport http --scope user asa ${url} \\
  --header "Authorization: Bearer SEU_TOKEN"`;
  const desktop = JSON.stringify({ mcpServers: { asa: { command: "npx", args: ["-y", "mcp-remote", url, "--header", "Authorization:Bearer SEU_TOKEN"] } } }, null, 2);
  const pre = { margin: 0, padding: 12, fontSize: "calc(12px * var(--fs, 1))", overflowX: "auto", background: "var(--bg-2, rgba(127,127,127,.08))", borderRadius: 8, whiteSpace: "pre" } as const;
  return (
    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
      <b style={{ fontWeight: 600 }}>Usar no Claude (MCP)</b>
      <span style={{ fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-2)" }}>
        O Claude Code e o Claude Desktop leem e escrevem nas suas notas, tarefas e Inbox. Com token de leitura, só consultam. Com token de leitura e escrita, criam e editam na hora (o próprio Claude pede sua permissão antes de cada ferramenta).
      </span>
      <span className="label">Claude Code (terminal)</span>
      <pre style={pre}>{code}</pre>
      <span className="label">Claude Desktop (claude_desktop_config.json)</span>
      <pre style={pre}>{desktop}</pre>
    </div>
  );
}

/** A extensão do navegador também entra por token. */
function ExtensionHelp() {
  return (
    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
      <b style={{ fontWeight: 600 }}>Extensão "Salvar no Asa"</b>
      <span style={{ fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-2)" }}>
        No Firefox ou no Zen, salva o artigo, a transcrição da aula ou o trecho selecionado em Leituras, e importa provas e entregas da agenda da faculdade como tarefas. Crie um token de leitura e escrita aqui e cole nas opções da extensão, com o endereço {location.origin}.
      </span>
    </div>
  );
}

function Data({ onToast }: { onToast: (t: Toast) => void }) {
  const [busy, setBusy] = useState<"json" | "md" | null>(null);

  const run = async (kind: "json" | "md") => {
    setBusy(kind);
    try {
      const data = await accountApi.exportAll();
      const stamp = new Date().toISOString().slice(0, 10);
      if (kind === "json") downloadFile(`asa-backup-${stamp}.json`, JSON.stringify(data, null, 2), "application/json");
      else downloadFile(`asa-markdown-${stamp}.zip`, buildMarkdownZip(data.pages) as BlobPart, "application/zip");
      onToast({ text: `Export pronto · ${data.pages.length} ${data.pages.length === 1 ? "página" : "páginas"}` });
    } catch {
      onToast({ text: "Não foi possível exportar." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="col enter" style={{ gap: 14 }}>
      <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <b style={{ fontWeight: 600 }}>Backup e export</b>
        <span style={{ fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-2)" }}>Markdown espelha a árvore de páginas em pastas. JSON leva tudo: páginas, tarefas, metas, capturas, cards e revisões. Senha e tokens nunca entram.</span>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-pri" type="button" disabled={busy !== null} onClick={() => void run("md")}>{busy === "md" ? "Gerando…" : "Exportar Markdown (.zip)"}</button>
          <button className="btn btn-sec" type="button" disabled={busy !== null} onClick={() => void run("json")}>{busy === "json" ? "Gerando…" : "Exportar JSON"}</button>
        </div>
      </div>
      <div className="card" style={{ padding: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span className="col grow1">
          <b style={{ fontWeight: 600 }}>Importar</b>
          <span style={{ fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-2)" }}>Notion (export .zip) ou um vault de Markdown, em passos.</span>
        </span>
        <a className="btn btn-sec" href={routeHash("importar")}>Abrir assistente</a>
      </div>
    </div>
  );
}

const PUSH_HELP: Record<Exclude<ReturnType<typeof pushSupport>, "ok">, string> = {
  "ios-install": "No iPhone, os avisos só funcionam com o app instalado: Compartilhar > Adicionar à Tela de Início, e abra por lá.",
  unsupported: "Este navegador não recebe avisos com o app fechado.",
  "no-sw": "Disponível no app publicado (o service worker não roda no modo de desenvolvimento).",
};

/** Avisos dos check-ins pelo sistema, mesmo com o app fechado (Web Push). */
function PushCard({ onToast }: { onToast: (t: Toast) => void }) {
  const support = pushSupport();
  const [devices, setDevices] = useState<PushDevice[] | null>(null);
  const [here, setHere] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(typeof Notification !== "undefined" && Notification.permission === "denied");

  const load = useCallback(async () => {
    const [res, sub] = await Promise.all([pushApi.get(), currentSubscription().catch(() => null)]);
    setDevices(res.subscriptions);
    // Só conta como ligado aqui se o servidor também conhece esta inscrição.
    setHere(sub && res.subscriptions.length > 0 ? sub.endpoint : null);
  }, []);

  useEffect(() => {
    load().catch(() => setDevices([]));
  }, [load]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch {
      onToast({ text: "Não foi possível falar com o servidor de avisos" });
    } finally {
      setBusy(false);
    }
  };

  const enable = () =>
    run(async () => {
      if ((await enablePush()) === "denied") {
        setDenied(Notification.permission === "denied");
        onToast({ text: "O navegador não deu permissão para notificações" });
      } else onToast({ text: "Avisos ligados neste aparelho" });
    });

  const test = () =>
    run(async () => {
      const r = await pushApi.test();
      onToast({ text: r.sent > 0 ? `Teste enviado para ${r.sent} ${r.sent === 1 ? "aparelho" : "aparelhos"}` : "Nenhum aparelho recebeu o teste" });
    });

  return (
    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        <span className="col grow1">
          <b style={{ fontWeight: 600 }}>Avisos com o app fechado</b>
          <span style={{ fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-2)" }}>Os check-ins chegam como notificação do sistema, no computador ou no celular. Respeitam o horário de silêncio.</span>
        </span>
        {support !== "ok" ? null : here ? (
          <>
            <span className="badge ok">ligado aqui</span>
            <button className="btn btn-sec btn-sm" type="button" disabled={busy} onClick={() => void test()}>Testar</button>
            <button className="btn btn-fan btn-sm" type="button" disabled={busy} onClick={() => void run(disablePush)}>Desligar</button>
          </>
        ) : (
          <button className="btn btn-pri" type="button" disabled={busy || denied} onClick={() => void enable()}>Ligar neste aparelho</button>
        )}
      </div>
      {support !== "ok" && <span className="help">{PUSH_HELP[support]}</span>}
      {support === "ok" && denied && <span className="help">As notificações estão bloqueadas para este site. Libere nas permissões do navegador e recarregue.</span>}
      {devices && devices.length > 0 && (
        <div className="col" style={{ gap: 0 }}>
          {devices.map((d) => (
            <div key={d.id} className="row" style={{ gap: 10, fontSize: "calc(13px * var(--fs, 1))", borderTop: "1px solid var(--border)", minHeight: 44 }}>
              <span className="grow1 trunc">{d.label || d.service}</span>
              <span className="spec">{d.lastOkAt ? `último aviso ${formatAgo(d.lastOkAt)}` : `inscrito ${formatAgo(d.createdAt)}`}</span>
              <button className="btn btn-fan btn-sm" type="button" disabled={busy} aria-label={`Remover ${d.label || d.service}`} onClick={() => void askConfirm({ title: `Parar os avisos em “${d.label || d.service}”?`, body: "Esse aparelho deixa de receber notificações até você ligar de novo nele.", confirmLabel: "Remover" }).then((ok) => { if (ok) void run(async () => { await pushApi.remove(d.id); }); })}>Remover</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function App() {
  const installable = useSyncExternalStore(onInstallChange, canInstall);
  const pending = usePending();
  return (
    <div className="col enter" style={{ gap: 14 }}>
      <div className="card" style={{ padding: 16, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <span className="col grow1">
          <b style={{ fontWeight: 600 }}>Instalar como aplicativo</b>
          <span style={{ fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-2)" }}>Abre em janela própria e funciona sem rede para leitura.</span>
        </span>
        {isStandalone() ? <span className="badge ok">instalado</span> : installable ? <button className="btn btn-pri" type="button" onClick={() => void promptInstall()}>Instalar</button> : <span className="help">O navegador oferece a instalação quando o app pode ser instalado.</span>}
      </div>
      <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="row"><b style={{ fontWeight: 600 }}>Fila offline</b>{pending.length > 0 && <span className="badge warn" style={{ marginLeft: "auto" }}>{pending.length} {pending.length === 1 ? "captura" : "capturas"} na fila</span>}</div>
        <span style={{ fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-2)" }}>Capturas feitas sem rede esperam aqui e sobem ao reconectar.</span>
        {pending.length === 0 && <span style={{ fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-3)" }}>Nada na fila.</span>}
        {pending.map((p) => (
          <div key={p.id} className="row" style={{ gap: 10, fontSize: "calc(13px * var(--fs, 1))", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
            <span className="grow1 trunc">{p.text}</span>
            <span className="spec">{formatAgo(p.createdAt)}</span>
            <button className="btn btn-fan btn-sm" type="button" onClick={() => removePending(p.id)}>Descartar</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Account({ onLogout, onToast }: { onLogout: () => void; onToast: (t: Toast) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = current !== "" && next.length >= 12;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await accountApi.changePassword(current, next);
      setCurrent("");
      setNext("");
      onToast({ text: "Senha alterada" });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setError("Senha atual incorreta.");
      else if (err instanceof ApiError && err.status === 429) setError("Muitas tentativas. Aguarde alguns minutos.");
      else if (err instanceof ApiError && err.status === 400) setError("A nova senha precisa ter de 12 a 200 caracteres.");
      else setError("Não foi possível alterar a senha.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="col enter" style={{ gap: 14 }}>
      <form className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <b style={{ fontWeight: 600 }}>Senha</b>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: 12 }}>
          <div className="field"><label className="label" htmlFor="sa">Senha atual</label><input id="sa" className="inp" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
          <div className="field"><label className="label" htmlFor="sn">Nova senha</label><input id="sn" className="inp" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /><span className="help">Mínimo de 12 caracteres.</span></div>
        </div>
        {error && <span role="alert" style={{ fontSize: "calc(13px * var(--fs, 1))", color: "var(--danger)" }}>{error}</span>}
        <button className="btn btn-sec" type="submit" disabled={!valid || busy} style={{ alignSelf: "flex-start" }}>Alterar senha</button>
      </form>
      <div className="card" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <span className="col grow1"><b style={{ fontWeight: 600 }}>Sessão</b><span style={{ fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-2)" }}>Este navegador</span></span>
        <button className="btn btn-fan btn-sm" type="button" onClick={onLogout}>Sair</button>
      </div>
    </div>
  );
}

export function SettingsView({ sub, preference, onPreference, onLogout, onToast }: SettingsViewProps) {
  const fromSub = (value: string | undefined): Tab => ALL_TABS.find((t) => t.toLowerCase() === value) ?? "Geral";
  const [tab, setTab] = useState<Tab>(() => fromSub(sub));
  // Um link para outra aba, estando já em Configurações, troca de aba.
  useEffect(() => {
    if (sub) setTab(fromSub(sub));
  }, [sub]);
  const { settings, failed, save } = useSettings(onToast);
  const needsSettings = tab === "Geral" || tab === "Rotina" || tab === "Assistentes";
  const s = settings ?? DEFAULT_SETTINGS;

  return (
    <div className="screen" style={{ maxWidth: 940, display: "flex", flexDirection: "column", gap: 18 }}>
      <h1 className="screen-title" style={{ marginBottom: 6 }}>Configurações</h1>
      <div className="tabs" role="tablist" aria-label="Seções" style={{ overflowX: "auto", overflowY: "hidden" }}>
        {TABS.map((t) => (
          <button key={t} className={`plain tab${tab === t ? " on" : ""}`} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} style={{ whiteSpace: "nowrap", position: "relative", padding: "8px 12px", height: 36 }}>{t}</button>
        ))}
      </div>
      {needsSettings && !settings && !failed && <span className="sk" style={{ height: 80, borderRadius: 10 }} aria-busy="true" aria-label="Carregando as configurações" />}
      {needsSettings && failed && <div className="card" role="alert" style={{ padding: 16, fontSize: "calc(14px * var(--fs, 1))" }}>Não foi possível carregar as configurações.</div>}
      {tab === "Geral" && settings && <General key="g" settings={s} save={save} preference={preference} onPreference={onPreference} />}
      {tab === "Rotina" && settings && <Routine key="r" settings={s} save={save} />}
      {tab === "Rotina" && !DEMO && <PushCard onToast={onToast} />}
      {tab === "Assistentes" && (DEMO ? <div className="card" style={{ padding: 16, fontSize: "calc(14px * var(--fs, 1))", color: "var(--text-2)" }}>{DEMO_AI_OFF}</div> : <Assistants onToast={onToast} settings={settings} save={save} />)}
      {tab === "API" && <Tokens onToast={onToast} />}
      {tab === "Dados" && <Data onToast={onToast} />}
      {tab === "Aplicativo" && <App />}
      {tab === "Conta" && <Account onLogout={onLogout} onToast={onToast} />}
    </div>
  );
}
