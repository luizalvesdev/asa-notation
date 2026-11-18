import { useState, type FormEvent } from "react";
import { api, type Me } from "./api.js";
import {
  describeAuthError,
  loginWithPasskey,
  passkeysSupported,
  PASSWORD_MIN_LENGTH,
  registerFirstPasskey,
  type AuthContext,
} from "./auth.js";

interface Props {
  me: Me;
  onAuthenticated: () => void;
}

type FirstMethod = "password" | "passkey";

export function AuthGate({ me, onAuthenticated }: Props) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [token, setToken] = useState("");
  const [deviceName, setDeviceName] = useState("Este dispositivo");
  const [method, setMethod] = useState<FirstMethod>("password");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firstAccess = !me.hasPasskeys && !me.hasPassword;
  const supportsPasskeys = passkeysSupported();

  async function run(context: AuthContext, action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onAuthenticated();
    } catch (err) {
      setError(describeAuthError(err, context));
    } finally {
      setBusy(false);
    }
  }

  const onPasswordLogin = (event: FormEvent) => {
    event.preventDefault();
    void run("login", () => api.passwordLogin(password).then(() => undefined));
  };

  const onFirstAccess = (event: FormEvent) => {
    event.preventDefault();
    if (method === "password") {
      if (password.length < PASSWORD_MIN_LENGTH) {
        setError(`A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`);
        return;
      }
      if (password !== confirm) {
        setError("As senhas não conferem.");
        return;
      }
      void run("bootstrap", () => api.setPassword(password, { bootstrapToken: token.trim() }).then(() => undefined));
    } else {
      void run("bootstrap", () => registerFirstPasskey(token.trim(), deviceName.trim() || "passkey"));
    }
  };

  return (
    <main className="auth">
      <div className="auth-card">
        <h1>asa-notation</h1>
        {firstAccess ? (
          <form onSubmit={onFirstAccess}>
            <p className="muted">Primeiro acesso. Escolha como você vai entrar.</p>
            <div className="segmented" role="tablist" aria-label="Forma de acesso">
              <button
                type="button"
                role="tab"
                aria-selected={method === "password"}
                className={method === "password" ? "active" : ""}
                onClick={() => setMethod("password")}
              >
                Senha
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={method === "passkey"}
                className={method === "passkey" ? "active" : ""}
                disabled={!supportsPasskeys}
                onClick={() => setMethod("passkey")}
              >
                Passkey
              </button>
            </div>
            <label>
              Token de bootstrap
              <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} required />
            </label>
            {method === "password" ? (
              <>
                <label>
                  Senha (mínimo {PASSWORD_MIN_LENGTH} caracteres)
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Confirmar senha
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                  />
                </label>
              </>
            ) : (
              <label>
                Nome do dispositivo
                <input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} maxLength={60} />
              </label>
            )}
            <button className="primary" type="submit" disabled={busy || token.trim() === ""}>
              {busy ? "Aguardando…" : method === "password" ? "Definir senha e entrar" : "Criar passkey"}
            </button>
          </form>
        ) : (
          <>
            {me.hasPassword && (
              <form onSubmit={onPasswordLogin}>
                <label>
                  Senha
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                    required
                  />
                </label>
                <button className="primary" type="submit" disabled={busy || password === ""}>
                  {busy ? "Entrando…" : "Entrar"}
                </button>
              </form>
            )}
            {me.hasPasskeys && supportsPasskeys && (
              <button
                className={me.hasPassword ? "secondary" : "primary"}
                disabled={busy}
                onClick={() => void run("login", loginWithPasskey)}
              >
                Entrar com passkey
              </button>
            )}
            {!me.hasPassword && !supportsPasskeys && (
              <p className="error">Este navegador não suporta passkeys e ainda não há senha definida.</p>
            )}
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
