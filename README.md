# asa-notation

Hub único de anotações, estudo e assistentes (Hermes e Renato). Planejamento em [docs/features.md](docs/features.md), design em [docs/design/](docs/design/README.md).

O projeto recomeçou do zero. O código anterior (API, web com Tiptap, migrações, SAM) está em `legacy/`, só como referência. O rascunho de arquitetura em [docs/design.md](docs/design.md) ainda precisa ser revisado nas etapas de modelo de dados e backend.

## Estrutura

```
apps/web    App web (Vite + React + TypeScript), baseado no design do Claude Design
apps/api    API (Lambda + Postgres): login por senha e páginas. Ver docs/api.md
docs/       Funcionalidades, arquitetura e design exportado
legacy/     Código anterior, não mantido
```

`apps/web/src/styles/` guarda o CSS do design system exportado (`base.css`, `telas.css`, `captura.css`). `overrides.css` tem os ajustes da implementação.

## Estado

- Design system (tokens, tema claro e escuro, movimento) portado.
- Login só com senha, com erro, carregando, bloqueio com contagem e offline.
- Shell: barra lateral (recolhível com ⌘\), barra superior, gaveta no celular, troca de tema.
- Backend: login por senha (sessão em cookie, bloqueio por falhas), árvore de páginas, edição com detecção de conflito, mover, lixeira, busca e backlinks. Detalhes em [docs/api.md](docs/api.md).
- As telas do web ainda são placeholders; só o login fala com a API.

## Comandos

```bash
npm install
npm run dev -w @asa/api   # API local em :8787 (imprime a senha de dev na primeira vez)
npm run dev               # web em http://localhost:5173 (proxy /api para 127.0.0.1:8787)
npm run typecheck
npm test
npm run build
```
