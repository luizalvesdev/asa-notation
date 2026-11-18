import { useCallback, useEffect, useState } from "react";
import { setUnauthorizedHandler } from "./api";
import { fetchSession, logout } from "./auth";
import { Login } from "./Login";
import { PublicView } from "./PublicView";
import { Shell } from "./Shell";
import { useRoute } from "./use-route";
import { useTheme } from "./use-theme";

type Session = "checando" | "anonimo" | "autenticado";

export function App() {
  const { theme, toggle: toggleTheme, preference, setPreference } = useTheme();
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

  // Link público: lê sem login, sem Shell.
  if (route.kind === "publica") {
    return (
      <div className={`ds full${theme === "escuro" ? " escuro" : ""}`} style={{ height: "100%" }}>
        <PublicView slug={route.slug} onToggleTheme={toggleTheme} />
      </div>
    );
  }

  return (
    <div className={`ds full${theme === "escuro" ? " escuro" : ""}`} style={{ height: "100%" }}>
      {session === "checando" && null}
      {session === "anonimo" && <Login dark={theme === "escuro"} onAuthenticated={onAuthenticated} onToggleTheme={toggleTheme} />}
      {session === "autenticado" && <Shell dark={theme === "escuro"} route={route} preference={preference} onPreference={setPreference} onToggleTheme={toggleTheme} onLogout={onLogout} />}
    </div>
  );
}
