# asa-notation

Workspace estilo Notion (páginas aninhadas, editor de blocos, busca) para Linux e celular. O desenho completo está em [docs/design.md](docs/design.md).

## Estrutura

```
apps/api        API (Lambda + HTTP API) e servidor local de desenvolvimento
apps/web        App web (Vite + React + Tiptap)
packages/core   Tipos e utilitários compartilhados
scripts/        Migração do Neon e smoke test
template.yaml   SAM: Lambda + HTTP API
```

## Desenvolvimento local

O servidor local usa um Postgres embutido (PGlite) em `.dev/pgdata`. Não toca o Neon nem o SSM.

```bash
npm install

# terminal 1: API em http://localhost:8787
npm run dev:api

# terminal 2: app em http://localhost:5173 (o proxy /api aponta para a API)
npm run dev -w @asa/web
```

Primeiro acesso: cadastre a passkey com o token de bootstrap que a API imprime ao iniciar. O navegador precisa de um autenticador com verificação de usuário (Chrome no Linux usa celular ou chave de segurança).

Para testar a interface sem passkey, suba a API com `DEV_LOGIN=1 npm run dev:api` e abra `http://localhost:8787/dev/login`. Essa rota existe só no servidor local, nunca na Lambda.

Para recomeçar do zero, apague `.dev/`.

## Comandos

```bash
npm run typecheck   # api, scripts e web
npm test            # vitest (inclui Postgres real em memória via PGlite)
npm run build       # sam build
npm run build -w @asa/web
npm run migrate     # aplica apps/api/migrations no Neon (URL lida do SSM)
npm run smoke:db    # confere o Neon em modo somente leitura
```

## Segredos (SSM, `sa-east-1`)

| Parâmetro | Conteúdo |
|---|---|
| `/asa/prod/neon/database-url` | connection string do Neon |
| `/asa/prod/auth/session-secret` | segredo que assina as sessões |
| `/asa/prod/auth/bootstrap-token` | token do primeiro cadastro de passkey |

## Antes do deploy

- O app web ainda não tem build de produção publicado (S3 + CloudFront).
- A passkey fica amarrada ao RP ID (`RpId` no `template.yaml`, hoje `localhost`). Em produção será o endereço do CloudFront, e o app e a API devem sair do mesmo CloudFront (`/api/*`).
