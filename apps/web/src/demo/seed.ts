// Conteúdo inicial da demo, criado pela própria API (a mesma validação do app de verdade).
import type { ApiRequest, ApiResponse } from "../../../api/src/http";

type Handle = (req: ApiRequest) => Promise<ApiResponse>;

const FENCE = "```";

const WELCOME = `Isto é uma **demo** do asa-notation, o caderno pessoal onde junto notas, tarefas, metas e estudo.

> Tudo aqui roda **dentro do seu navegador**: não existe servidor por trás. O que você escrever fica só neste aparelho, e o botão "Recomeçar" no topo volta tudo ao início.

## Para experimentar
- Digite **/** numa linha vazia para ver os blocos (títulos, tarefas, código, diagramas, tabelas).
- Selecione um trecho para formatar ou virar link.
- Arraste os blocos pela alça à esquerda.
- **Ctrl+K** abre a busca. **G** e depois uma letra pula de tela: **G H** (Hoje), **G S** (Semana), **G E** (Estudo), **G M** (Metas).
- Clique com o botão direito em tarefas, cards e páginas para ver as ações.
- Em **Estudo** tem um baralho pronto para revisar com repetição espaçada.

## O que fica de fora
Os assistentes de IA (Hermes, Renato e a IA da página) usam a conta do autor, então ficam **desligados** aqui. O mesmo vale para notificações push, tokens de API e o servidor MCP.

- [ ] Criar uma página nova
- [ ] Marcar uma tarefa de hoje como feita
- [ ] Revisar os cards de Sistemas distribuídos`;

const KAFKA = `Um **consumer group** divide as partições de um tópico entre os consumidores do grupo. Cada partição vai para **um único** consumidor do grupo de cada vez.

${FENCE}mermaid
flowchart LR
  T[(tópico pedidos)] --> P0[partição 0]
  T --> P1[partição 1]
  T --> P2[partição 2]
  P0 --> C1[consumer A]
  P1 --> C1
  P2 --> C2[consumer B]
${FENCE}

## Pontos que caem em entrevista
- Mais consumidores que partições: os que sobram ficam parados.
- O **offset** é salvo por grupo e partição, então dois grupos leem o mesmo tópico de forma independente.
- Rebalanceamento acontece quando um consumidor entra, sai ou para de mandar heartbeat.

## Consumidor idempotente
${FENCE}ts
async function handle(msg: Pedido) {
  // a mesma mensagem pode chegar duas vezes: a chave evita processar de novo
  const novo = await db.insertIfAbsent("processed", msg.id);
  if (!novo) return;
  await cobrar(msg);
}
${FENCE}`;

const RAFT = `Raft resolve **consenso**: vários servidores concordam com a mesma sequência de comandos, mesmo com falhas.

## Papéis
- **Líder**: recebe as escritas e replica o log.
- **Seguidor**: só responde ao líder.
- **Candidato**: pede votos quando o líder some.

${FENCE}mermaid
sequenceDiagram
  participant C as Cliente
  participant L as Líder
  participant S1 as Seguidor 1
  participant S2 as Seguidor 2
  C->>L: SET x = 5
  L->>S1: AppendEntries
  L->>S2: AppendEntries
  S1-->>L: ok
  L-->>C: confirmado (maioria)
${FENCE}

Uma entrada só é **confirmada** quando a maioria do cluster a gravou. Com 5 nós, o cluster aguenta 2 falhas.`;

const ARQUITETURA = `Como o asa-notation roda em produção, gastando perto de **US$ 1 por mês**.

${FENCE}mermaid
flowchart TB
  U[Navegador / PWA] --> CF[CloudFront]
  CF --> S3[(S3: app web)]
  CF --> API[API Gateway]
  API --> L[Lambda Node 22]
  L --> DB[(Postgres Neon)]
  L --> B[Bedrock: Claude]
  EB[EventBridge a cada 30 min] --> L
  L --> WP[Web Push]
${FENCE}

## Decisões
- **Uma Lambda só** para a API inteira: menos cold start espalhado e deploy simples com SAM.
- **Postgres serverless** (Neon), que dorme quando ninguém usa.
- Editor de blocos com **Tiptap**; o documento é JSON e o texto puro vai para a busca com \`unaccent\`.
- Esta demo roda a mesma API no navegador, com **PGlite** (Postgres em WebAssembly).`;

const ONE_ON_ONE = `## Pauta
- [x] Status da migração do serviço de pagamentos
- [ ] Pedir revisão do design de filas
- [ ] Combinar a data da apresentação técnica

## Anotações
- Prioridade do trimestre: **reduzir incidentes de reprocessamento**.
- Ideia: documentar o padrão de consumidor idempotente e compartilhar com o time.`;

const LEITURAS = `## Lendo agora
- *Designing Data-Intensive Applications*, capítulos 5 a 9.

## Fila
1. *Database Internals*
2. *The Pragmatic Programmer*
3. *A Philosophy of Software Design*

> "Complexidade é tudo que torna um sistema difícil de entender e de mudar." (John Ousterhout)`;

function localDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function seedDemo(handle: Handle): Promise<void> {
  const call = async <T = Record<string, unknown>>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> => {
    const res = await handle({ method, path, query: {}, headers: { origin: location.origin, ...headers }, cookies: {}, body });
    if (res.status >= 400) throw new Error(`seed ${method} ${path}: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body as T;
  };
  // O `handle` desta função já injeta a sessão; aqui só montamos o conteúdo.

  const { secret } = await call<{ secret: string; token: { id: string } }>("POST", "/tokens", { name: "seed", scope: "write" });
  const tokens = await call<{ tokens: { id: string }[] }>("GET", "/tokens");
  const mcp = (name: string, args: Record<string, unknown>) =>
    call("POST", "/mcp", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, { authorization: `Bearer ${secret}` });

  const page = async (title: string, icon: string, parentId?: string) => (await call<{ page: { id: string } }>("POST", "/pages", { title, icon, ...(parentId ? { parentId } : {}) })).page.id;
  const findPage = async (title: string) => {
    const { pages } = await call<{ pages: { id: string; title: string }[] }>("GET", "/pages/tree");
    return pages.find((p) => p.title === title)!.id;
  };
  const writePage = async (title: string, icon: string, markdown: string, parentId?: string) => {
    await mcp("create_page", { title, markdown, ...(parentId ? { parentId } : {}) });
    await call("PATCH", `/pages/${await findPage(title)}`, { icon });
  };

  await writePage("Bem-vindo à demo", "👋", WELCOME);
  const estudos = await page("Estudos", "📚");
  await writePage("Kafka: consumer groups", "🧵", KAFKA, estudos);
  await writePage("Raft em 5 minutos", "🗳️", RAFT, estudos);
  const trabalho = await page("Trabalho", "💼");
  await writePage("Arquitetura do asa-notation", "🏗️", ARQUITETURA, trabalho);
  await writePage("1:1 com a liderança", "🤝", ONE_ON_ONE, trabalho);
  await writePage("Leituras", "📖", LEITURAS);
  await call("PATCH", `/pages/${await findPage("Bem-vindo à demo")}`, { favorite: true });

  const goal = async (title: string, description: string, dueDate: string) => (await call<{ goal: { id: string } }>("POST", "/goals", { title, description, dueDate })).goal.id;
  const certificacao = await goal("Passar na certificação AWS Developer", "Estudar 30 min por dia e fazer 3 simulados.", localDate(45));
  const artigo = await goal("Publicar um artigo técnico por mês", "Transformar as notas de estudo em posts.", localDate(30));

  const task = async (title: string, date: string | null, time: string | null = null, goalId: string | null = null) =>
    (await call<{ task: { id: string } }>("POST", "/tasks", { title, date, time, goalId })).task.id;
  const done = await task("Revisar PR do serviço de pagamentos", localDate(0), "09:30");
  await call("POST", `/tasks/${done}/done`, { done: true });
  await task("Daily do time", localDate(0), "10:00");
  await task("Escrever rascunho do post sobre consumidores idempotentes", localDate(0), "15:00", artigo);
  await task("Simulado 1 da certificação", localDate(1), "19:00", certificacao);
  await task("Ler capítulo 6 do DDIA (particionamento)", localDate(1));
  await task("Preparar a apresentação técnica", localDate(3), "14:00");
  await task("Revisar os cards de Raft", localDate(2), null, certificacao);
  await task("Atualizar o README do projeto", null);

  const { deck } = await call<{ deck: { id: string } }>("POST", "/study/decks", { title: "Sistemas distribuídos" });
  await call("POST", "/study/cards/bulk", {
    deckId: deck.id,
    items: [
      { kind: "basic", front: "Para que serve um consumer group no Kafka?", back: "Dividir as partições de um tópico entre os consumidores, para processar em paralelo." },
      { kind: "cloze", front: "Cada partição é lida por {{um único}} consumidor do grupo de cada vez." },
      { kind: "basic", front: "Quando uma entrada do log é confirmada no Raft?", back: "Quando a maioria do cluster a gravou." },
      { kind: "basic", front: "Quantas falhas um cluster Raft de 5 nós aguenta?", back: "2 (a maioria, 3, continua de pé)." },
      { kind: "cloze", front: "Um consumidor {{idempotente}} pode receber a mesma mensagem duas vezes sem efeito duplicado." },
      { kind: "basic", front: "O que dispara um rebalanceamento no consumer group?", back: "Um consumidor entrar, sair ou parar de mandar heartbeat." },
    ],
  });

  for (const [text, kind] of [
    ["Testar o PGlite para rodar Postgres no navegador #estudo", "study"],
    ["Ideia de post: quanto custa rodar um app pessoal na AWS #ideia", "idea"],
    ["Levar o padrão de outbox para a reunião de arquitetura #trabalho", "work"],
  ] as const) {
    await call("POST", "/captures", { text, kind });
  }

  for (const t of tokens.tokens) await call("DELETE", `/tokens/${t.id}`);
}
