import { useEffect, useState } from "react";
import { Icon, ThemeIcon } from "./icons";
import { routeTitle, type RouteId } from "./nav";
import { Sidebar } from "./Sidebar";

interface ShellProps {
  route: RouteId;
  onToggleTheme: () => void;
  onLogout: () => void;
}

export function Shell({ route, onToggleTheme, onLogout }: ShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const title = routeTitle(route);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "\\") {
        event.preventDefault();
        setCollapsed((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="ds app">
      <Sidebar current={route} collapsed={collapsed} onToggleCollapsed={() => setCollapsed((v) => !v)} />
      <div className="main">
        <header className="tb">
          <button className="btn btn-fan btn-ico mob" type="button" aria-label="Abrir navegação" onClick={() => setDrawer(true)}>
            <Icon name="menu" />
          </button>
          <nav className="crumbs" aria-label="Caminho">
            <span className="cur">{title}</span>
          </nav>
          <div className="tb-r">
            <button className="btn btn-fan btn-ico btn-sm" type="button" aria-label="Alternar tema" onClick={onToggleTheme}>
              <ThemeIcon />
            </button>
            <button className="btn btn-fan btn-sm" type="button" onClick={onLogout}>
              Sair
            </button>
          </div>
        </header>
        <main className="scroll">
          <div style={{ padding: "40px 40px 120px", maxWidth: 1180 }}>
            <h1 style={{ fontFamily: "var(--serif)", fontWeight: 500, fontSize: 40, lineHeight: "44px", letterSpacing: "-.02em" }}>{title}</h1>
            <p className="muted" style={{ marginTop: 12, fontSize: 15 }}>
              Tela em construção.
            </p>
          </div>
        </main>
      </div>
      <div className={`drawer${drawer ? " on" : ""}`} aria-hidden={!drawer}>
        <div className="scr" onClick={() => setDrawer(false)} />
        <div className="pane">
          <Sidebar current={route} collapsed={false} inDrawer onToggleCollapsed={() => undefined} onNavigate={() => setDrawer(false)} />
        </div>
      </div>
    </div>
  );
}
