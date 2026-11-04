import { useState, type FormEvent } from "react";
import { describeAuthError, loginWithPasskey, passkeysSupported, registerFirstPasskey } from "./auth.js";

interface Props {
  hasPasskeys: boolean;
  onAuthenticated: () => void;
}

export function AuthGate({ hasPasskeys, onAuthenticated }: Props) {
  const [token, setToken] = useState("");
  const [deviceName, setDeviceName] = useState("Este dispositivo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onAuthenticated();
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  const onRegister = (event: FormEvent) => {
    event.preventDefault();
    void run(() => registerFirstPasskey(token.trim(), deviceName.trim() || "passkey"));
  };

  return (
    <main className="auth">
      <div className="auth-card">
        <h1>asa-notation</h1>
        {!passkeysSupported() ? (
          <p className="error">Este navegador não suporta passkeys.</p>
        ) : hasPasskeys ? (
          <>
            <p className="muted">Entre com a sua passkey.</p>
            <button className="primary" disabled={busy} onClick={() => void run(loginWithPasskey)}>
              {busy ? "Aguardando…" : "Entrar com passkey"}
            </button>
          </>
        ) : (
          <form onSubmit={onRegister}>
            <p className="muted">Primeiro acesso: cadastre a passkey deste dispositivo.</p>
            <label>
              Token de bootstrap
              <input
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
              />
            </label>
            <label>
              Nome do dispositivo
              <input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} maxLength={60} />
            </label>
            <button className="primary" type="submit" disabled={busy || token.trim() === ""}>
              {busy ? "Aguardando…" : "Criar passkey"}
            </button>
          </form>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </main>
  );
}
