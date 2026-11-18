# Arquitetura do asa-notation

Hub pessoal, de um único usuário. Substituiu Notion, Obsidian e Telegram: os assistentes moram dentro do app e a autenticação é só senha. Este documento descreve o que existe; as funcionalidades e prioridades estão em [features.md](features.md) e as rotas em [api.md](api.md).

## Visão geral

```
Navegador (PWA)  ──►  CloudFront ──►  S3 (app estático)
   React + Tiptap            └─/api/*─►  HTTP API ─► Lambda ─► Postgres (Neon)
                                                     └─► API do Claude (só no chat)
```

App e API compartilham o domínio, então o cookie de sessão é *first-party*. Em desenvolvimento, o Vite faz proxy de `/api` para um servidor Node que usa PGlite (Postgres em WebAssembly) e roda as mesmas rotas.

## Web (`apps/web`)

- Vite, React 19, TypeScript. Roteamento por *hash* (`#/hoje`, `#/p/<id>`, `#/s/<slug>` para o link público, que abre fora do app).
- Editor: Tiptap v3 com extensões próprias (destaque, diagrama Mermaid, links de página). Autosave com debounce e detecção de conflito por `rev`.
- Estilo: o design system exportado do Claude Design (`styles/base.css`, `telas.css`, `captura.css`), com tema claro e escuro e `overrides.css` para os ajustes da implementação.
- Lógica testável fica em módulos puros (`*-logic.ts`, `db-logic.ts`, `canvas-logic.ts`...), separada dos componentes.
- PWA: `public/sw.js` guarda a interface e as últimas leituras de páginas, tarefas, metas e capturas; capturas feitas sem rede entram numa fila (`capture-outbox.ts`) com ids gerados no cliente, então reenviar não duplica.

## API (`apps/api`)

- Um roteador próprio sobre uma função pura `(ApiRequest) => ApiResponse`. Adaptadores: AWS Lambda e servidor local.
- Postgres acessado por uma interface mínima (`SqlClient.query`), com consultas de uma instrução (CTEs) porque o driver HTTP do Neon não tem transações interativas.
- Migrações em `apps/api/migrations/*.sql`, aplicadas em ordem.
- Autenticação: senha (scrypt) + cookie de sessão assinado; tokens de API (`Authorization: Bearer`) com escopo de leitura ou escrita para integrações. Rotas sensíveis (senha, configurações, tokens, chave de IA) aceitam só a sessão do dono.

### Dados

| Área | Tabelas |
| --- | --- |
| Páginas | `pages` (árvore por `parent_id`, posição fracionária, `kind`: página, database, linha ou canvas, `props`, `schema`, `cover`, soft delete), `page_links`, `page_versions`, `page_shares` |
| Tarefas e metas | `tasks` (recorrência, subtarefas, `goal_id`), `task_completions`, `goals` |
| Captura | `captures` |
| Estudo | `decks`, `cards` (estado FSRS em JSON), `review_logs` |
| Rotina | `notifications`, `weekly_reviews`, `settings` |
| Plataforma | `api_tokens`, `owner_password`, `secrets` (chave de IA cifrada) |
| Assistentes | `chat_conversations`, `chat_messages`, `ai_drafts` |

Decisões que valem lembrar:

- **Linhas de database são páginas.** Têm título e corpo, ficam fora da árvore e seguem a database na lixeira.
- **Soft delete compartilhado**: a subárvore apagada de uma vez recebe o mesmo `deleted_at`, o que permite restaurar exatamente o que saiu junto.
- **Datas** de tarefas são datas civis (AAAA-MM-DD) no fuso de quem usa; o cliente informa "hoje" e o fuso.
- **Check-ins** não dependem de cron: a caixa de notificações os gera na hora de ler (com chave de deduplicação), então nada se perde se o app ficou fechado.
- **Estudo** usa FSRS (`ts-fsrs`). Revisões vencidas e até 10 cards novos por dia.

### Assistentes

Hermes (rotina, tarefas, metas), Renato (capturas e notas) e Tutor (professor socrático) usam o Claude com a chave do dono. Cada turno é um laço de até 6 idas ao modelo com ferramentas; ferramentas de leitura executam, ferramentas `propose_*` só criam **rascunhos**, e nada vira dado antes de `approve`. Um orçamento de 24 s por turno evita estourar o limite de 30 s do API Gateway. O conteúdo das notas é tratado como dado, não como instrução.

## Segurança

Ver o resumo no [README](../README.md#segurança-em-resumo) e o detalhe de cada rota em [api.md](api.md). Pontos de atenção: a CSP libera imagens `https:` (capas e imagens por URL), então quem abre uma página compartilhada pode expor o IP ao site da imagem; o SVG do Mermaid é gerado em modo `strict` e inserido na página.

## Fora do escopo (ainda)

Ver [features.md](features.md#status-da-implementação).
