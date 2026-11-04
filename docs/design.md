# Design: workspace estilo Notion para Linux e celular

Status: rascunho para revisão. Nada implementado. Nome do projeto: `asa-notation`.

## 1. Decisões já tomadas

- PWA (web-first), instalável no Android e no Linux. Tauri fica como opcional futuro.
- Serverless na AWS `sa-east-1`: Lambda + API Gateway HTTP API (SAM), como o hermes-v2. Sem VPS.
- Banco Neon Postgres, com scale-to-zero. O cold start (cerca de 1 s) é aceito. Manter ligado foi descartado por custo.
- O banco é a fonte da verdade. O GitHub não recebe commits do app.
- Corpo da página guardado como JSON do editor (Tiptap/ProseMirror). Markdown é gerado para a ponte com o Obsidian.
- Autenticação por passkey (WebAuthn). Uso de uma pessoa só.
- SRS com FSRS (`ts-fsrs`).
- Obsidian continua como segundo cérebro no desktop, ligado por uma ponte (daemon local).
- Bots do Hermes e do Renato passam a gravar no banco trocando o `VaultStore` (opção B da seção 8), depois que a API e as páginas existirem.

## 2. Requisito central: propagação rápida

Escrever no Telegram e demorar horas para aparecer no Obsidian ou no app é o problema a evitar. Orçamento de latência:

| Caminho | Meta | Como |
|---|---|---|
| Telegram para banco | menos de 2 s | Lambda do webhook grava direto |
| Banco para PWA aberto | até 10 s | consulta de "head" enquanto a aba está visível; refetch ao focar |
| Banco para Obsidian | até 15 s | daemon local consulta o "head" a cada 15 s (60 s em repouso) |
| Obsidian para banco | cerca de 2 s | file watcher (inotify) com debounce de 1 s |
| PC desligado | recupera ao ligar | o daemon lê `/changes?since=cursor` na partida |

### Sinal de mudança

`GET /sync/head` devolve `select max(rev)` direto do Neon. Sem DynamoDB nem outra peça.

Consequência assumida: enquanto o daemon do Obsidian ou o PWA estiverem consultando, o Neon não entra em scale-to-zero. Mitigações:

- O PWA só consulta com a aba visível e sem foco perdido; ao focar, faz um refetch.
- O daemon aumenta o intervalo (por exemplo 60 s) depois de alguns minutos sem mudanças e volta a 15 s quando detecta atividade.
- Sem cliente consultando (PC desligado, aba fechada), o Neon dorme normalmente.

Medir o consumo real de compute no Neon nas primeiras semanas. Se pesar, o DynamoDB entra atrás do mesmo endpoint (`GET /sync/head`), sem mudar nenhum cliente.

## 3. Modelo de dados (Postgres)

```sql
create sequence change_seq;

create table pages (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references pages(id),
  database_id uuid references pages(id),          -- preenchido se for linha de um database
  kind        text not null check (kind in ('page','database')),
  title       text not null default '',
  body        jsonb,                              -- JSON do editor
  body_text   text not null default '',           -- texto puro derivado, para busca
  source_md   text,                               -- Markdown original quando importado do Obsidian
  props       jsonb not null default '{}',        -- valores das propriedades, por chave
  origin      text not null default 'app',        -- app | hermes | renato | obsidian
  vault_path  text unique,                        -- arquivo espelhado no Obsidian, se houver
  rev         bigint not null default nextval('change_seq'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz                         -- soft delete: nada é apagado de verdade
);
create index on pages (rev);
create index on pages (parent_id);
create index on pages (database_id);
create index pages_search on pages using gin (to_tsvector('portuguese', title || ' ' || body_text));

create table db_properties (
  database_id uuid references pages(id),
  key         text,
  name        text not null,
  type        text not null,   -- text | number | select | multi_select | date | checkbox | relation | status
  options     jsonb not null default '{}',
  position    int not null,
  primary key (database_id, key)
);

create table views (
  id          uuid primary key default gen_random_uuid(),
  database_id uuid not null references pages(id),
  name        text not null,
  type        text not null check (type in ('table','kanban','calendar')),
  config      jsonb not null default '{}'   -- filtros, ordenação, propriedade de agrupamento
);

create table links (
  from_page uuid references pages(id),
  to_page   uuid references pages(id),       -- null se o alvo ainda não existe
  to_title  text not null,                   -- texto do [[wikilink]]
  primary key (from_page, to_title)
);

create table cards (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid not null references pages(id),
  kind       text not null check (kind in ('basic','cloze')),
  front      text not null,
  back       text not null,
  fingerprint text not null,                 -- hash estável para recriar cards sem perder histórico
  suspended  boolean not null default false,
  due        timestamptz not null default now(),
  stability  real, difficulty real,
  state      smallint not null default 0,    -- 0 novo, 1 aprendendo, 2 revisão, 3 reaprendendo
  reps       int not null default 0,
  lapses     int not null default 0,
  last_review timestamptz,
  unique (page_id, fingerprint)
);
create index on cards (due) where not suspended;

create table reviews (
  id          uuid primary key,              -- gerado no cliente: torna o envio idempotente
  card_id     uuid not null references cards(id),
  rating      smallint not null,             -- 1 de novo, 2 difícil, 3 bom, 4 fácil
  reviewed_at timestamptz not null,
  state_before jsonb not null
);

create table passkeys (
  id            uuid primary key default gen_random_uuid(),
  credential_id text unique not null,
  public_key    bytea not null,
  counter       bigint not null default 0,
  transports    text[],
  name          text not null,
  created_at    timestamptz not null default now()
);

create table device_tokens (                  -- para o daemon do Obsidian e para bots
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  token_hash text not null,
  scope      text not null check (scope in ('full','bot','sync')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
```

Observações:

- `rev` vem de uma sequência global e é renovado em toda escrita (inclusive soft delete). O feed de mudanças é `where rev > :cursor order by rev`.
- `links`, `cards`, `body_text` são derivados do `body` e recalculados na mesma transação da escrita. Cards usam `fingerprint` para que editar o texto ao redor não zere o histórico de revisão.
- Estado do SRS fica em `cards`, então sincroniza entre PC e celular sem commits.

## 4. API (Lambda + HTTP API)

Autenticação: cookie de sessão (passkey) no navegador; `Authorization: Bearer <device token>` no daemon e nos bots.

Auth
- `POST /auth/passkey/register/options` e `/verify`: cadastro de passkey. O primeiro cadastro exige um token de bootstrap gerado no deploy; depois só com sessão ativa.
- `POST /auth/passkey/login/options` e `/verify`; `POST /auth/logout`.
- `POST /devices`, `DELETE /devices/:id`: gerenciar tokens do daemon e de bots (exige sessão).

Sincronização
- `GET /sync/head`: `{ seq }`, hoje um `select max(rev)` no Neon. O contrato permite trocar o backend depois sem mudar os clientes.
- `GET /changes?since=N&limit=200`: páginas com `rev > N` (inclui apagadas), e `next` como novo cursor.

Páginas
- `GET /pages/:id`, `GET /pages/:id/children`, `GET /pages/:id/backlinks`.
- `POST /pages`.
- `PATCH /pages/:id` com `base_rev`. Props são mescladas por chave. Troca de `body` exige `base_rev` igual ao atual. Se divergir, `409` com a versão do servidor; o cliente nunca perde a edição local.
- `DELETE /pages/:id`: soft delete.
- `GET /search?q=`.

Databases
- `POST /databases`, `PATCH /databases/:id/properties`.
- `GET /databases/:id/rows?view=:viewId` e CRUD de `views`.

SRS
- `GET /srs/due?limit=`.
- `POST /srs/reviews` com `id` gerado no cliente (idempotente) e o rating. O servidor aplica o FSRS e devolve o novo estado do card.
- `GET /srs/stats`.

Captura
- `POST /capture` com `{ text }`: cria página na Inbox. Usado pelo PWA (celular) e, no futuro, pelos bots.

Regras herdadas do contrato do Hermes: o corpo de uma página pertence ao usuário; um token com `scope: bot` só cria páginas e altera props que ele possui, nunca reescreve o corpo depois da criação; nada é apagado; toda operação é idempotente.

## 5. Autenticação por passkey

- WebAuthn com `@simplewebauthn/server`, verificação de usuário (biometria ou PIN) obrigatória no cadastro e no login. Credenciais em `passkeys`.
- Sessão: cookie `asa_session` assinado (HMAC), `HttpOnly`, `Secure`, `SameSite=Strict`, validade de 30 dias, sem renovação por enquanto. O desafio do WebAuthn viaja em outro cookie assinado (`asa_challenge`, 5 min), então não há tabela de desafios. Tipos de token distintos (`typ`) impedem usar um no lugar do outro.
- Primeiro cadastro: exige o header `x-bootstrap-token` (SSM, `/asa/prod/auth/bootstrap-token`) e só vale enquanto não existe nenhuma passkey. Depois disso, novas passkeys exigem sessão ativa.
- Domínio fixo (RP ID) é pré-requisito: passkey fica amarrada ao domínio. Começa em `localhost` para desenvolvimento; trocar de domínio exige recadastrar.
- Recomenda-se cadastrar pelo menos duas passkeys (notebook e celular).
- `device tokens` (`asa_…`, só o hash SHA-256 fica no banco, exibido uma única vez) para o daemon do Obsidian e para bots. Escopos: `sync` (lê `/sync/head` e `/changes`), `full` (igual a `sync` por enquanto) e `bot` (sem acesso ao feed de sincronização). Token de dispositivo nunca gerencia dispositivos nem passkeys. `last_used_at` é atualizado no máximo uma vez por hora, para o polling não gerar escrita.
- Requisições que mudam estado e não usam token de dispositivo exigem `Origin` dentro de `ALLOWED_ORIGINS`, além do `SameSite=Strict`.
- API Gateway com limite de 10 req/s (burst 20) por rota.
- Fica para depois: CORS com credenciais (entra junto com o app web), renovação de sessão e revogação de sessão (hoje só expira).

## 6. Ponte com o Obsidian (`vaultd`)

Daemon local em TypeScript, rodando como serviço de usuário (systemd). Espelha uma subpasta do vault (ex.: `Notion/`), nunca o vault inteiro. Isso protege o resto do Obsidian.

- Banco para disco: consulta `/sync/head` a cada 15 s (com jitter). Se `seq` mudou, lê `/changes`, gera `.md` (frontmatter com `id` e props, corpo em Markdown) e grava com arquivo temporário + rename. Guarda o hash do que escreveu para não tratar a própria gravação como edição do usuário.
- Disco para banco: watcher inotify, debounce de 1 s, converte Markdown em JSON do editor e envia `PATCH` com `base_rev`.
- Round-trip: o corpo só é reescrito no arquivo quando o banco mudou, e só é enviado ao banco quando o arquivo mudou. Páginas importadas do Obsidian guardam o `source_md` original para comparação.
- Conflito (mesma página editada nos dois lados): nada é sobrescrito. Mantém as duas versões, a segunda como página `… (conflito)`.
- Fica para a segunda fase: exportação somente leitura vem primeiro, depois a escrita de volta.

## 7. Risco principal: Markdown e editor

O Tiptap normaliza o Markdown ao serializar. A decisão de guardar JSON como fonte isola o app desse problema. O risco passa para a ponte (Obsidian para banco). Mitigação: começar com a ponte somente leitura, medir diferenças em notas reais e só então ligar a escrita.

## 8. Bots do Hermes e do Renato: ponto em aberto

Hoje o fluxo é Telegram para Lambda para GitHub (vault). Se os bots ficarem como estão, o app precisa ingerir do GitHub, e o app precisaria escrever de volta no GitHub quando você marcar uma tarefa como feita, senão o Hermes não enxerga. Isso reintroduz commits e é a parte mais complexa.

- **Opção A, ingestão do GitHub.** Webhook de `push` do GitHub dispara uma Lambda que importa os arquivos alterados. Latência de segundos. Bots intactos. Edições do app em dados dos bots exigem commit de volta.
- **Opção B, trocar o `VaultStore` do hermes-v2.** A interface (`read`, `create`, `update`, `list`) já isola o I/O. Uma implementação `DbVaultStore` mapeia os caminhos `Hermes/...` e `Renato/Notas/...` para linhas em `pages` (`vault_path`, `origin`). Os bots ficam quase intactos e passam a gravar direto no banco: latência de segundos e nenhum commit. Mudança pequena e localizada.

**Decisão: opção B**, aplicada depois que páginas, databases e a API estiverem de pé.

## 9. Fatias do MVP

1. Esqueleto: monorepo, SAM, Neon, passkey, `GET /sync/head`, `GET /changes`.
2. Páginas aninhadas, editor de blocos, busca.
3. Databases com tabela e kanban.
4. SRS: cards no corpo, tela de revisão com FSRS.
5. PWA: captura rápida e cache offline de leitura com fila de capturas.
6. Bots no banco (opção B) e importação do `Hermes/` e `Renato/Notas`.
7. Ponte Obsidian (leitura, depois escrita).

## 10. Em aberto

- Domínio (necessário para passkey; `asa-notation` é o nome, ainda não um domínio registrado).
- Web Push para lembrete de revisão do SRS (fase posterior).
