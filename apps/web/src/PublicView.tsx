import { useEffect, useState } from "react";
import { ApiError, publicApi } from "./api";
import { boundsOf } from "./canvas-logic";
import type { Shape } from "./canvas-types";
import { Cover } from "./Cover";
import { DocView } from "./DocView";
import { ShapesSvg } from "./ShapesSvg";
import { ThemeIcon } from "./icons";

interface PublicViewProps {
  slug: string;
  onToggleTheme: () => void;
}

type PublicPageData = { title: string; icon: string | null; cover: string | null; kind: string; body: unknown; updatedAt: string };
type Load = { status: "carregando" } | { status: "ausente" } | { status: "erro" } | { status: "pronto"; page: PublicPageData };

/** Página compartilhada por link: só leitura, sem login e sem nada do resto do app. */
export function PublicView({ slug, onToggleTheme }: PublicViewProps) {
  const [load, setLoad] = useState<Load>({ status: "carregando" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setLoad({ status: "carregando" });
    publicApi
      .get(slug)
      .then((page) => live && setLoad({ status: "pronto", page }))
      .catch((err: unknown) => live && setLoad({ status: err instanceof ApiError && err.status === 404 ? "ausente" : "erro" }));
    return () => {
      live = false;
    };
  }, [slug, attempt]);

  useEffect(() => {
    if (load.status === "pronto") document.title = `${load.page.title.trim() || "Sem título"} · asa-notation`;
    return () => {
      document.title = "asa-notation";
    };
  }, [load]);

  return (
    <div className="app" style={{ display: "block", height: "100%", overflow: "auto" }}>
      <header className="tb" style={{ position: "sticky", top: 0, zIndex: 5, background: "var(--bg)" }}>
        <span className="av u" style={{ width: 24, height: 24 }}>a</span>
        <span style={{ fontWeight: 600, fontSize: "calc(13px * var(--fs, 1))" }}>asa-notation</span>
        <span className="badge out" style={{ marginLeft: 8 }}>somente leitura</span>
        <div className="tb-r">
          <button className="btn btn-fan btn-ico btn-sm" type="button" aria-label="Alternar tema" onClick={onToggleTheme}>
            <ThemeIcon />
          </button>
        </div>
      </header>
      <main className="page" style={{ paddingTop: 40 }}>
        {load.status === "carregando" && (
          <div aria-busy="true" aria-label="Carregando a página">
            <span className="sk" style={{ height: 40, width: "55%", display: "block" }} />
            <div className="col" style={{ gap: 10, marginTop: 28 }}>
              <span className="sk" style={{ height: 14, width: "90%" }} />
              <span className="sk" style={{ height: 14, width: "80%" }} />
            </div>
          </div>
        )}
        {load.status === "ausente" && (
          <>
            <h1 className="p-title" style={{ fontFamily: "var(--serif)", fontWeight: 500, fontSize: "calc(40px * var(--fs, 1))", lineHeight: "calc(46px * var(--fs, 1))" }}>Página indisponível</h1>
            <p className="muted" style={{ marginTop: 12 }}>Este link não existe mais ou deixou de ser compartilhado.</p>
          </>
        )}
        {load.status === "erro" && (
          <>
            <h1 style={{ fontFamily: "var(--serif)", fontWeight: 500, fontSize: "calc(32px * var(--fs, 1))" }}>Não foi possível abrir</h1>
            <button className="btn btn-sec" type="button" onClick={() => setAttempt((a) => a + 1)} style={{ marginTop: 12 }}>
              Tentar de novo
            </button>
          </>
        )}
        {load.status === "pronto" && (
          <article>
            <Cover cover={load.page.cover} />
            <h1 style={{ fontFamily: "var(--serif)", fontWeight: 500, fontSize: "calc(40px * var(--fs, 1))", lineHeight: "calc(46px * var(--fs, 1))", letterSpacing: "-0.02em" }}>
              {load.page.icon ? `${load.page.icon} ` : ""}
              {load.page.title.trim() || "Sem título"}
            </h1>
            {load.page.kind === "canvas" ? (
              <CanvasReadOnly shapes={((load.page.body as { shapes?: Shape[] } | null)?.shapes ?? [])} />
            ) : (
            <div style={{ marginTop: 20 }}>
              {/* Links para outras páginas do dono não abrem aqui: quem lê não tem acesso a elas. */}
              <DocView doc={load.page.body} onLinkClick={(href) => (href.startsWith("#/") ? undefined : window.open(href, "_blank", "noopener,noreferrer"))} />
            </div>
            )}
          </article>
        )}
      </main>
    </div>
  );
}

/** Quadro compartilhado, só para ver: enquadrado no desenho. */
function CanvasReadOnly({ shapes }: { shapes: Shape[] }) {
  const box = boundsOf(shapes);
  if (!box) return <p className="muted" style={{ marginTop: 20 }}>Quadro vazio.</p>;
  const pad = 24;
  return (
    <svg role="img" aria-label="Quadro" viewBox={`${box.x - pad} ${box.y - pad} ${box.w + pad * 2} ${box.h + pad * 2}`} style={{ width: "100%", maxHeight: "70vh", marginTop: 20, border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)" }}>
      <ShapesSvg shapes={shapes} />
    </svg>
  );
}
