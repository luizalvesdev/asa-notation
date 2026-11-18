import type { Row, SqlClient } from "../sql.js";
import type { Block } from "../ai/anthropic.js";

export type Agent = "hermes" | "renato";
export type DraftKind = "tasks" | "capture" | "page";
export type DraftStatus = "pending" | "approved" | "discarded";

export interface Draft {
  id: string;
  kind: DraftKind;
  payload: Record<string, unknown>;
  status: DraftStatus;
  result: Record<string, unknown> | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  drafts: Draft[];
}

export interface Conversation {
  id: string;
  agent: Agent;
  title: string;
  updatedAt: string;
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string | Block[];
  visible: boolean;
}

const iso = (v: unknown) => new Date(v as string | Date).toISOString();

function toDraft(row: Row): Draft {
  return { id: row.id as string, kind: row.kind as DraftKind, payload: row.payload as Record<string, unknown>, status: row.status as DraftStatus, result: (row.result as Record<string, unknown> | null) ?? null };
}

export class PgChatStore {
  constructor(
    private readonly sql: SqlClient,
    private readonly clock: () => number = Date.now,
  ) {}

  private now() {
    return new Date(this.clock()).toISOString();
  }

  async create(agent: Agent, title: string): Promise<Conversation> {
    const now = this.now();
    const rows = await this.sql.query(`insert into chat_conversations (agent, title, created_at, updated_at) values ($1, $2, $3, $3) returning id, agent, title, updated_at`, [agent, title, now]);
    return this.toConversation(rows[0]!);
  }

  private toConversation(row: Row): Conversation {
    return { id: row.id as string, agent: row.agent as Agent, title: row.title as string, updatedAt: iso(row.updated_at) };
  }

  async get(id: string): Promise<Conversation | null> {
    const rows = await this.sql.query(`select id, agent, title, updated_at from chat_conversations where id = $1`, [id]);
    return rows[0] ? this.toConversation(rows[0]) : null;
  }

  async list(agent: Agent, limit = 30): Promise<Conversation[]> {
    const rows = await this.sql.query(`select id, agent, title, updated_at from chat_conversations where agent = $1 order by updated_at desc, id limit $2`, [agent, limit]);
    return rows.map((r) => this.toConversation(r));
  }

  async remove(id: string): Promise<boolean> {
    return (await this.sql.query(`delete from chat_conversations where id = $1 returning id`, [id])).length > 0;
  }

  async touch(id: string, title?: string): Promise<void> {
    await this.sql.query(`update chat_conversations set updated_at = $2, title = case when title = '' and $3::text is not null then $3 else title end where id = $1`, [id, this.now(), title ?? null]);
  }

  async add(conversationId: string, role: "user" | "assistant", content: string | Block[], text: string, visible: boolean): Promise<string> {
    const rows = await this.sql.query(
      `insert into chat_messages (conversation_id, role, content, text, visible, created_at) values ($1, $2, $3::jsonb, $4, $5, $6) returning id`,
      [conversationId, role, JSON.stringify(content), text, visible, this.now()],
    );
    return rows[0]!.id as string;
  }

  /** Todas as mensagens, na ordem, para reenviar ao modelo (inclui chamadas e resultados de ferramenta). */
  async replay(conversationId: string): Promise<StoredMessage[]> {
    const rows = await this.sql.query(`select id, role, content, visible from chat_messages where conversation_id = $1 order by seq`, [conversationId]);
    return rows.map((r) => ({ id: r.id as string, role: r.role as "user" | "assistant", content: r.content as string | Block[], visible: r.visible as boolean }));
  }

  /** Mensagens para mostrar, cada uma com seus rascunhos. */
  async visible(conversationId: string): Promise<ChatMessage[]> {
    const [messages, drafts] = await Promise.all([
      this.sql.query(`select id, role, text, created_at from chat_messages where conversation_id = $1 and visible order by seq`, [conversationId]),
      this.sql.query(`select id, message_id, kind, payload, status, result from ai_drafts where conversation_id = $1 order by seq`, [conversationId]),
    ]);
    return messages.map((m) => ({
      id: m.id as string,
      role: m.role as "user" | "assistant",
      text: m.text as string,
      createdAt: iso(m.created_at),
      drafts: drafts.filter((d) => d.message_id === m.id).map(toDraft),
    }));
  }

  async addDraft(conversationId: string, kind: DraftKind, payload: Record<string, unknown>): Promise<string> {
    const rows = await this.sql.query(`insert into ai_drafts (conversation_id, kind, payload, created_at) values ($1, $2, $3::jsonb, $4) returning id`, [conversationId, kind, JSON.stringify(payload), this.now()]);
    return rows[0]!.id as string;
  }

  /** Liga os rascunhos criados durante o turno à mensagem final do assistente. */
  async attachDrafts(ids: string[], messageId: string): Promise<void> {
    if (ids.length > 0) await this.sql.query(`update ai_drafts set message_id = $2 where id = any($1::uuid[])`, [ids, messageId]);
  }

  async draft(id: string): Promise<Draft | null> {
    const rows = await this.sql.query(`select id, kind, payload, status, result from ai_drafts where id = $1`, [id]);
    return rows[0] ? toDraft(rows[0]) : null;
  }

  /** Muda de pendente para aprovado ou descartado. Só funciona uma vez. */
  async decide(id: string, status: "approved" | "discarded", result: Record<string, unknown> | null): Promise<boolean> {
    const rows = await this.sql.query(`update ai_drafts set status = $2, result = $3::jsonb, decided_at = $4 where id = $1 and status = 'pending' returning id`, [id, status, result === null ? null : JSON.stringify(result), this.now()]);
    return rows.length > 0;
  }
}
