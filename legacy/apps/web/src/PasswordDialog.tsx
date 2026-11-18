import { useEffect, useState, type FormEvent } from "react";
import { api } from "./api.js";
import { describeAuthError, PASSWORD_MIN_LENGTH } from "./auth.js";

interface Props {
  hasPassword: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function PasswordDialog({ hasPassword: hadPassword, onClose, onSaved }: Props) {
  const [hasPassword] = useState(hadPassword);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (next.length < PASSWORD_MIN_LENGTH) return setError(`A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`);
    if (next !== confirm) return setError("As senhas não conferem.");
    setBusy(true);
    setError(null);
    try {
      await api.setPassword(next, hasPassword ? { currentPassword: current } : {});
      setDone(true);
      onSaved();
    } catch (err) {
      setError(describeAuthError(err, "change"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog" role="dialog" aria-label={hasPassword ? "Trocar senha" : "Definir senha"} onSubmit={submit}>
        <h2>{hasPassword ? "Trocar senha" : "Definir senha"}</h2>
        {done ? (
          <>
            <p>Senha salva. Use-a para entrar em outros dispositivos.</p>
            <button type="button" className="primary" onClick={onClose}>
              Fechar
            </button>
          </>
        ) : (
          <>
            {!hasPassword && <p className="muted">Com uma senha você entra em qualquer dispositivo, sem passkey.</p>}
            {hasPassword && (
              <label>
                Senha atual
                <input
                  type="password"
                  autoComplete="current-password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  autoFocus
                  required
                />
              </label>
            )}
            <label>
              Nova senha (mínimo {PASSWORD_MIN_LENGTH} caracteres)
              <input
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoFocus={!hasPassword}
                required
              />
            </label>
            <label>
              Confirmar nova senha
              <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="dialog-actions">
              <button type="button" className="ghost" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="primary" disabled={busy}>
                {busy ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
