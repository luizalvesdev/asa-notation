# asa-notation

Hub pessoal de anotações, estudo e assistentes (Hermes, Renato e Tutor), de uso individual, em português do Brasil. Substitui Notion, Obsidian e Telegram.

- Planejamento e prioridades: [docs/features.md](docs/features.md)
- Arquitetura: [docs/design.md](docs/design.md)
- API (rotas, regras e limites): [docs/api.md](docs/api.md)
- Design (exportado do Claude Design): [docs/design/](docs/design/README.md)

O código de uma tentativa anterior está em `legacy/`, só como referência.

## Estrutura

```
apps/web    App web (Vite + React 19 + TypeScript + Tiptap), PWA instalável
apps/api    API (AWS Lambda ou servidor local) sobre Postgres (Neon em produção, PGlite em dev)
docs/       Funcionalidades, arquitetura, API e o design exportado
template.yaml / samconfig.toml   Infraestrutura (AWS SAM): Lambda, HTTP API, S3 e CloudFront
```

## O que já existe

**Escrever e organizar**: páginas aninhadas com editor de blocos (títulos, listas, tarefas, citação, código, tabela, destaque, bloco recolhível, imagem por URL, diagrama Mermaid com exportação SVG/PNG, divisor), menu `/`, alça de arrastar, barra de formatação, links `[[` e `@` com backlinks, ícone e capa, favoritas e recentes, modelos, histórico de versões com comparação e restauração, lixeira, busca global (⌘K) e link público de leitura. Páginas **canvas** (quadro livre) e **databases** (propriedades tipadas, views de tabela, kanban, lista e calendário, filtros, ordenação, agrupamento e linhas que são páginas).

**Tarefas e rotina**: Hoje, Semana (arrastar entre dias), tarefas com hora, recorrência e subtarefas, Metas ligadas às tarefas, Rotina (métricas da quinta, revisão do sábado e foco da semana), notificações e Progresso.

**Captura**: captura rápida (⌘⇧K) com fila offline e Inbox com classificação, tags e mover para uma página.

**Estudo**: trilhas ligadas às metas, cards básicos e de lacuna extraídos das páginas (`Pergunta :: resposta`, `{{lacuna}}`), revisão com FSRS, estatísticas.

**Assistentes** (Claude, com a sua chave): painel de chat (⌘J) com Hermes, Renato e Tutor. A saída é sempre rascunho a aprovar.

**Plataforma**: login só com senha, PWA com leitura offline, importação de Notion e vaults de Markdown, exportação em Markdown e JSON, tokens de API e configurações.

O que ficou de fora está em [docs/features.md](docs/features.md#status-da-implementação).

## Comandos

```bash
npm install
npm run dev -w @asa/api   # API local em :8787 (imprime a senha de dev na primeira vez)
npm run dev               # web em http://localhost:5173 (proxy /api para 127.0.0.1:8787)
npm run typecheck
npm test
npm run build
```

Variáveis úteis no desenvolvimento: `DEV_PASSWORD` define a senha do dono; `ASA_AI_MOCK=1` troca o provedor de IA por uma versão de mentira (sem chave nem internet) para testar o chat.

## Segurança em resumo

Sessão em cookie `HttpOnly` + `SameSite=Strict`, senha com scrypt e bloqueio por falhas, checagem de `Origin` em toda escrita feita com cookie, tokens de API (somente o hash é guardado; não mexem em senha, configurações nem tokens), chave de IA cifrada (AES-256-GCM) e link público com identificador aleatório que só expõe título, ícone, capa e conteúdo. O CloudFront aplica CSP e demais cabeçalhos de segurança (`template.yaml`). O service worker nunca guarda login, configurações, tokens nem export, e limpa os dados em cache no logout.
