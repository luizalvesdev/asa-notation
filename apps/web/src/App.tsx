import { useCallback, useEffect, useState } from "react";
import { setUnauthorizedHandler } from "./api";
import { fetchSession, logout } from "./auth";
import { Login } from "./Login";
import { Shell } from "./Shell";
import { useRoute } from "./use-route";
import { useTheme } from "./use-theme";

type Session = "checando" | "anonimo" | "autenticado";

export function App() {
  const [theme, toggleTheme] = useTheme();
  const [session, setSession] = useState<Session>("checando");
  const route = useRoute();

  useEffect(() => {
    let live = true;
    void fetchSession().then((ok) => {
      if (live) setSession(ok ? "autenticado" : "anonimo");
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setSession("anonimo"));
    return () => setUnauthorizedHandler(null);
  }, []);

  const onAuthenticated = useCallback(() => setSession("autenticado"), []);
  const onLogout = useCallback(() => {
    void logout().then(() => setSession("anonimo"));
  }, []);

  useEffect(() => {
    document.documentElement.style.colorScheme = theme === "escuro" ? "dark" : "light";
  }, [theme]);

  return (
    <div className={`ds full${theme === "escuro" ? " escuro" : ""}`} style={{ height: "100%" }}>
      {session === "checando" && null}
      {session === "anonimo" && <Login onAuthenticated={onAuthenticated} onToggleTheme={toggleTheme} />}
      {session === "autenticado" && <Shell route={route} onToggleTheme={toggleTheme} onLogout={onLogout} />}
    </div>
  );
}
