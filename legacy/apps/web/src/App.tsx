import { useCallback, useEffect, useState } from "react";
import { api, UNAUTHORIZED_EVENT, type Me } from "./api.js";
import { AuthGate } from "./AuthGate.js";
import { Workspace } from "./Workspace.js";

type State = { status: "loading" } | { status: "error" } | { status: "ready"; me: Me };

export function App() {
  const [state, setState] = useState<State>({ status: "loading" });

  const refresh = useCallback(async () => {
    try {
      setState({ status: "ready", me: await api.me() });
    } catch {
      setState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onUnauthorized = () => void refresh();
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      await refresh();
    }
  }, [refresh]);

  if (state.status === "loading") return <p className="placeholder">Carregando…</p>;
  if (state.status === "error") {
    return (
      <div className="placeholder">
        <p>Não foi possível falar com o servidor.</p>
        <button className="primary" onClick={() => void refresh()}>
          Tentar de novo
        </button>
      </div>
    );
  }
  if (!state.me.authenticated) {
    return <AuthGate me={state.me} onAuthenticated={() => void refresh()} />;
  }
  return (
    <Workspace
      hasPassword={state.me.hasPassword}
      onLogout={() => void logout()}
      onAccountChanged={() => void refresh()}
    />
  );
}
