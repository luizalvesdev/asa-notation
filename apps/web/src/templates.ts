import type { JSONContent } from "@tiptap/react";

export interface Template {
  id: string;
  title: string;
  icon: string;
  description: string;
  /** Título já preenchido na página nova. */
  pageTitle: string;
  body: JSONContent;
}

const p = (text: string): JSONContent => ({ type: "paragraph", content: text ? [{ type: "text", text }] : [] });
const h = (level: number, text: string): JSONContent => ({ type: "heading", attrs: { level }, content: [{ type: "text", text }] });
const bullets = (...items: string[]): JSONContent => ({ type: "bulletList", content: items.map((t) => ({ type: "listItem", content: [p(t)] })) });
const tasks = (...items: string[]): JSONContent => ({ type: "taskList", content: items.map((t) => ({ type: "taskItem", attrs: { checked: false }, content: [p(t)] })) });
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });

export const TEMPLATES: Template[] = [
  {
    id: "reuniao",
    title: "Nota de reunião",
    icon: "🗓️",
    description: "Pauta, notas e próximos passos",
    pageTitle: "Reunião",
    body: doc(h(2, "Pauta"), bullets("", ""), h(2, "Notas"), p(""), h(2, "Decisões"), bullets(""), h(2, "Próximos passos"), tasks("")),
  },
  {
    id: "estudo",
    title: "Nota de estudo",
    icon: "📚",
    description: "Resumo e cards para revisar",
    pageTitle: "Estudo",
    body: doc(h(2, "Resumo"), p(""), h(2, "Cards"), p("Escreva Pergunta :: resposta para virar um card básico, ou uma frase com {{lacuna}} para um card de lacuna. Depois use Estudo > Extrair."), p("O que é um quorum? :: A maioria dos nós."), h(2, "Fontes"), bullets("")),
  },
  {
    id: "projeto",
    title: "Projeto",
    icon: "🚀",
    description: "Objetivo, marcos e tarefas",
    pageTitle: "Projeto",
    body: doc(h(2, "Objetivo"), p(""), h(2, "Marcos"), bullets("", ""), h(2, "Tarefas"), tasks("", ""), h(2, "Riscos"), bullets("")),
  },
  {
    id: "diario",
    title: "Diário",
    icon: "📓",
    description: "Como foi o dia",
    pageTitle: "Diário",
    body: doc(h(2, "Hoje"), p(""), h(2, "Gratidão"), bullets("", "", ""), h(2, "Amanhã"), tasks("")),
  },
  {
    id: "leitura",
    title: "Leitura",
    icon: "📖",
    description: "Notas de um livro ou artigo",
    pageTitle: "Leitura",
    body: doc(h(2, "Resumo em uma frase"), p(""), h(2, "Ideias principais"), bullets("", ""), h(2, "Citações"), { type: "blockquote", content: [p("")] }, h(2, "O que vou aplicar"), tasks("")),
  },
];
