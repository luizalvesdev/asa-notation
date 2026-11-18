# API do asa-notation

Backend em `apps/api`: TypeScript, Postgres (Neon em produção, PGlite no desenvolvimento e nos testes), uma Lambda atrás do CloudFront. Todas as rotas ficam sob `/api` (o prefixo é removido antes do roteamento). Corpo e respostas em JSON.

## Autenticação

Uma pessoa só, só senha. A sessão é um cookie assinado (`asa_session`, `HttpOnly`, `SameSite=Strict`, `Secure` em produção, 30 dias).

- Requisições que alteram dados (tudo que não é GET) precisam de `Origin` igual a uma das origens configuradas. Sem isso, 403.
- A senha tem de 12 a 200 caracteres, guardada com scrypt.
- 5 falhas seguidas bloqueiam o login por 15 minutos (429 com `retryAfterSeconds`). Cada falha informa `remaining`.
- O primeiro cadastro da senha não tem rota pública: `npm run set-password -w @asa/api` grava o hash direto no banco (usa `DATABASE_URL`, ou o parâmetro do SSM). No servidor de dev, a primeira subida gera uma senha e imprime uma vez (ou usa `DEV_PASSWORD`).

| Método | Rota | Sessão | Descrição |
| --- | --- | --- | --- |
| GET | `/auth/me` | não | `{ authenticated, hasPassword }` |
| POST | `/auth/password/login` | não | `{ password }`. 200, 401 `{ remaining }`, 429 `{ retryAfterSeconds }` |
| POST | `/auth/password/change` | sim | `{ currentPassword, newPassword }`. 403 se a atual estiver errada |
| POST | `/auth/logout` | não | Limpa o cookie |

## Páginas

Árvore de páginas aninhadas. O corpo é o JSON do editor (Tiptap, `{ "type": "doc", ... }`, até 500 KB). A ordem entre irmãs usa chaves fracionárias (`position`), então reordenar mexe em uma linha só. Apagar é soft delete: a subárvore inteira recebe o mesmo `deletedAt`.

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/pages/tree` | Todas as páginas ativas, sem corpo: `id, parentId, title, icon, favorite, position` |
| POST | `/pages` | `{ parentId?, title?, icon?, body? }`. Cria no fim das irmãs. 201 |
| GET | `/pages/:id` | Página com corpo |
| PATCH | `/pages/:id` | Qualquer de `title, icon, favorite, body`, mais `baseRev?`. 409 `{ page }` se o `rev` mudou |
| POST | `/pages/:id/move` | `{ parentId, before? ou after? }`. 409 `cycle` se mover para dentro de si mesma |
| DELETE | `/pages/:id` | Manda a subárvore para a lixeira. `{ deleted: n }` |
| GET | `/pages/trash` | Raízes da lixeira (o que foi apagado direto) |
| POST | `/pages/:id/restore` | Restaura a subárvore. Se o pai continua apagado, vai para a raiz |
| GET | `/pages/search?q=&limit=` | Título e conteúdo, com prefixo e sem diferenciar acento. Trecho com o termo entre U+0001 e U+0002 (nunca HTML) |
| GET | `/pages/:id/backlinks` | Páginas que citam esta com `[[Título]]` |

Links `[[Título]]` são extraídos do texto do corpo ao salvar e casam por título, sem diferenciar maiúsculas nem espaços repetidos. Renomear a página alvo desfaz o vínculo.

`rev` vem de uma sequência global e cresce a cada escrita. Serve para detectar conflito de edição (`baseRev`) e, mais tarde, para sincronização offline.

## Limites conhecidos

- O destaque do trecho na busca só marca o termo quando ele é digitado com o mesmo acento do texto.
- Não há exclusão definitiva: a lixeira só restaura.
- Ainda não existem databases, cards de estudo, tarefas, agentes nem notificações. O modelo de dados cresce por migrações (`apps/api/migrations`).

## Comandos

```bash
npm run dev -w @asa/api            # API local em http://localhost:8787 (PGlite em .dev/pgdata)
npm run migrate -w @asa/api        # aplica migrações no Neon (DATABASE_URL ou SSM)
npm run set-password -w @asa/api   # define a senha do dono
npm test                           # testes (Postgres real em memória)
```
