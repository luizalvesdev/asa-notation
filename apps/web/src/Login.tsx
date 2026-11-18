import { useEffect, useReducer, useRef, useState, type FormEvent } from "react";
import { loginWithPassword } from "./auth";
import { Icon, ThemeIcon } from "./icons";
import { initialLogin, isFieldInvalid, loginMessage, reduceLogin } from "./login-state";

interface LoginProps {
  dark: boolean;
  onAuthenticated: () => void;
  onToggleTheme: () => void;
}

export function Login({ dark, onAuthenticated, onToggleTheme }: LoginProps) {
  const [state, dispatch] = useReducer(reduceLogin, initialLogin);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const locked = state.status === "bloqueado";
  const busy = state.status === "carregando";

  useEffect(() => {
    input.current?.focus();
  }, []);

  useEffect(() => {
    if (!locked) return;
    const timer = setInterval(() => dispatch({ type: "tick" }), 1000);
    return () => clearInterval(timer);
  }, [locked]);

  useEffect(() => {
    if (state.status !== "ok") return;
    const timer = setTimeout(onAuthenticated, 450);
    return () => clearTimeout(timer);
  }, [state.status, onAuthenticated]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || locked || password.length === 0) return;
    dispatch({ type: "submit" });
    const result = await loginWithPassword(password);
    dispatch({ type: "result", result });
    if (result.kind === "invalid") input.current?.select();
  }

  const invalid = isFieldInvalid(state.status);

  return (
    <div className={`ds app${dark ? " escuro" : ""}`} style={{ display: "flex" }}>
      <div className="main" style={{ alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div className="row" style={{ position: "absolute", top: 12, right: 12, gap: 2 }}>
          <button className="btn btn-fan btn-ico btn-sm" type="button" aria-label="Alternar tema" onClick={onToggleTheme}>
            <ThemeIcon />
          </button>
        </div>
        <form className="col rise rel" onSubmit={submit} noValidate style={{ width: 360, maxWidth: "100%", gap: 22 }}>
          <div className="col" style={{ gap: 14, alignItems: "flex-start" }}>
            <span
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "var(--text)",
                color: "var(--bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="feather" large />
            </span>
            <h1 style={{ fontFamily: "var(--serif)", fontWeight: 500, fontSize: 34, lineHeight: "40px", letterSpacing: "-.02em" }}>
              Bem-vindo de volta
            </h1>
            <p className="muted" style={{ fontSize: 14 }}>
              Seu caderno está protegido por senha.
            </p>
          </div>

          <div className="field">
            <label className="label" htmlFor="pw">
              Senha
            </label>
            <div className="rel">
              <input
                id="pw"
                ref={input}
                className={`inp${invalid ? " err" : ""}`}
                type={show ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={invalid}
                aria-describedby="pw-msg"
                disabled={busy}
                style={{ height: 44, fontSize: 15, paddingRight: 76 }}
              />
              <button
                className="btn btn-fan btn-sm"
                type="button"
                onClick={() => setShow((v) => !v)}
                style={{ position: "absolute", right: 6, top: 8 }}
              >
                {show ? "Ocultar" : "Mostrar"}
              </button>
            </div>
            <span id="pw-msg" className={`help${invalid ? " err" : ""}`} role={invalid ? "alert" : "status"}>
              {loginMessage(state)}
            </span>
          </div>

          <button
            className={`btn btn-pri${busy ? " btn-load" : ""}`}
            type="submit"
            aria-busy={busy}
            disabled={busy || locked || password.length === 0}
            style={{ height: 44, fontSize: 15 }}
          >
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
