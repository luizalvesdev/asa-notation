# Design: databases (fatia 3)

Status: implementado (v1), com as decisões da seção 8 fechadas: schema e views em `props` do database, os sete tipos abaixo, relação e filtros para depois. Diferença em relação ao rascunho: não existe `POST /databases`; um database é criado com `POST /pages` e `kind: "database"`, que recebe o schema vazio e uma view de tabela.

## 1. Escopo

Entra nesta fatia:

- Criar um database como página da árvore.
- Propriedades tipadas.
- Linhas que também são páginas, com corpo editável igual a qualquer página.
- View de tabela: editar células, adicionar e remover linhas, ordenar.
- View de kanban: colunas por uma propriedade de seleção, arrastar cartões entre colunas.

Fica para depois:

- Filtros.
- Calendário.
- Relação entre databases (necessária para tarefa→meta do Hermes).
- Fórmulas.
- Rollups.
- Importação do Hermes.

## 2. Onde mora o schema

O database é uma página `kind = 'database'`. As linhas são páginas com `database_id` apontando para ele. A árvore lateral já esconde as linhas.

**Proposta:** guardar o schema (propriedades) e as views dentro de `props` da própria página do database, não nas tabelas `db_properties` e `views` criadas na migração 001.

| | Schema em `props` do database (proposto) | Tabelas `db_properties` e `views` |
|---|---|---|
| Sincronização | Mudar o schema renova o `rev` do database. O feed de mudanças e o daemon do Obsidian veem a alteração sem nada novo. | O feed não enxerga essas tabelas. Seria preciso outro feed ou outro `rev`. |
| Concorrência | O mesmo `baseRev` e o mesmo 409 que as páginas já usam | Controle próprio |
| Consulta por propriedade no SQL | Possível com `jsonb`, um pouco mais verbosa | Mais direta |
| Tamanho | Um database tem dezenas de propriedades, poucos KB | Indiferente |

A migração 002 removeria `db_properties` e `views`, que estão vazias.

Formato:

```json
{
  "schema": {
    "properties": [
      { "key": "p_status", "name": "Status", "type": "select",
        "options": [ { "id": "o_1", "name": "A fazer", "color": "gray" },
                     { "id": "o_2", "name": "Feito", "color": "green" } ] },
      { "key": "p_due", "name": "Prazo", "type": "date" }
    ]
  },
  "views": [
    { "id": "v_1", "name": "Tabela", "type": "table",
      "columns": [ { "key": "title", "width": 280 }, { "key": "p_status" }, { "key": "p_due" } ],
      "sort": [ { "key": "p_due", "direction": "asc" } ] },
    { "id": "v_2", "name": "Quadro", "type": "kanban", "groupBy": "p_status" }
  ]
}
```

- A `key` de cada propriedade é um identificador estável e aleatório. Renomear a propriedade não mexe nos valores das linhas.
- O título da linha é o `title` da página, e não uma propriedade.

## 3. Tipos de propriedade (v1)

| Tipo | Valor guardado em `props` da linha | Observação |
|---|---|---|
| `text` | string | até 2000 caracteres |
| `number` | número finito | |
| `select` | id da opção | |
| `multi_select` | lista de ids de opção | sem repetição |
| `date` | `AAAA-MM-DD` | dia inteiro; hora fica para depois |
| `checkbox` | booleano | |
| `url` | string `http(s)://` | |

Regras:

- Ausente ou `null` significa vazio.
- O servidor valida o valor contra o schema ao criar ou editar uma linha.
- Uma chave que não existe no schema é recusada.
- Apagar uma opção de seleção não reescreve as linhas: um id de opção que não existe mais aparece como vazio.
- Apagar uma propriedade remove do schema, e os valores ficam órfãos e invisíveis. Uma limpeza preguiçosa os remove na próxima edição da linha. Nada é reescrito em massa.

## 4. Ordem das linhas

O kanban e a ordem manual da tabela precisam de posição. A proposta é uma coluna nova `pages.sort_key` (texto, indexação fracionária): mover um cartão altera só aquela linha, sem renumerar as outras.

- Ordem padrão: `sort_key`, com desempate por `created_at`.
- Quando a view define `sort`, a ordenação por propriedade vence a ordem manual.

## 5. API

Linhas continuam sendo páginas. A diferença é que `POST /pages` e `PATCH /pages/:id` validam `props` contra o schema quando a página tem `database_id`.

| Rota | Função |
|---|---|
| `POST /databases` | cria a página do database com schema vazio, uma view de tabela e uma de kanban (esta só depois que existir uma propriedade de seleção) |
| `GET /databases/:id/rows` | todas as linhas, sem o corpo: `id`, `title`, `props`, `sort_key`, `rev` |
| `PATCH /pages/:id` no database | edita schema e views, com `baseRev`. Mudanças de schema são validadas (tipos conhecidos, chaves únicas, opções com id). |
| `POST /pages` com `databaseId` | cria linha |
| `PATCH /pages/:id` na linha | edita título, células (props), `sortKey`, corpo |

As linhas vêm todas de uma vez e a ordenação é feita no cliente. Para uso pessoal (centenas a poucos milhares de linhas) basta. Paginação fica para quando um database passar de uns 2000 itens.

## 6. Interface

- Na árvore lateral, o database aparece com um ícone próprio. Abrir mostra o título, as abas de view e a view ativa.
- **Tabela:**
  - Cabeçalho com nome e tipo de cada coluna. Clicar no cabeçalho renomeia, troca o tipo, edita opções ou apaga a coluna.
  - Botão para nova coluna. Células editáveis no lugar.
  - Linha "+ Nova" no fim. Ordenação clicando no cabeçalho.
- **Kanban:**
  - Uma coluna por opção da seleção escolhida, mais "Sem valor".
  - Arrastar entre colunas muda o valor, e arrastar dentro da coluna muda `sort_key`.
  - "+ Nova" em cada coluna.
- Abrir uma linha mostra a página normal com um bloco de propriedades acima do editor.
- Salvar segue o mesmo esquema das páginas: autosave com `baseRev` e aviso de conflito.

## 7. Integração futura com o Hermes

Com relação entre databases, `Hermes/tarefas` e `Hermes/metas` viram dois databases:

- **Tarefas:** `status` (seleção pendente/feita/cancelada), `due` (data) e `meta` (relação).
- **Metas.**

O `DbVaultStore` (opção B) passaria a gravar linhas. Isso fica para a fatia em que os bots migrarem.

## 8. Decisões pedidas

1. Schema e views em `props` do database (proposto) ou nas tabelas separadas?
2. Os tipos da v1 (texto, número, seleção, multisseleção, data, checkbox, url) bastam? Relação fica para depois?
3. Filtros podem ficar fora da v1?
