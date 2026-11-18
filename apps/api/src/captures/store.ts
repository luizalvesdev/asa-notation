import type { Row, SqlClient } from "../sql.js";
import type { Capture, CapturePatch, Counts, Kind, NewCapture } from "./model.js";
import { KINDS } from "./model.js";
import { extractTags } from "./text.js";

const COLUMNS = "id, text, kind, tags, created_at";
const INBOX = "archived_at is null and moved_page_id is null";
const LIMIT = 500;

function toCapture(row: Row): Capture {
  return {
    id: row.id as string,
    text: row.text as string,
    kind: (row.kind as Kind | null) ?? null,
    tags: (row.tags as string[]) ?? [],
    createdAt: new Date(row.created_at as string | Date).toISOString(),
  };
}

export type BulkAction = { action: "archive" } | { action: "restore" } | { action: "kind"; kind: Kind | null };

export class PgCaptureStore {
  constructor(
    private readonly sql: SqlClient,
    private readonly clock: () => number = Date.now,
  ) {}

  private nowIso(): string {
    return new Date(this.clock()).toISOString();
  }

  /** `kind`: um tipo, "none" (sem tipo) ou omitido (todas). */
  async list(kind?: Kind | "none"): Promise<Capture[]> {
    const filter = kind === "none" ? "and kind is null" : kind ? "and kind = $1" : "";
    const rows = await this.sql.query(
      `select ${COLUMNS} from captures where ${INBOX} ${filter} order by created_at desc, id desc limit ${LIMIT}`,
      kind && kind !== "none" ? [kind] : [],
    );
    return rows.map(toCapture);
  }

  async counts(): Promise<Counts> {
    const rows = await this.sql.query(`select kind, count(*)::int as n from captures where ${INBOX} group by kind`);
    const counts = Object.fromEntries([...KINDS, "none", "total"].map((k) => [k, 0])) as Counts;
    for (const row of rows) {
      const n = Number(row.n);
      counts[(row.kind as Kind | null) ?? "none"] += n;
      counts.total += n;
    }
    return counts;
  }

  async get(id: string): Promise<Capture | null> {
    const rows = await this.sql.query(`select ${COLUMNS} from captures where id = $1`, [id]);
    return rows[0] ? toCapture(rows[0]) : null;
  }

  /** Reenviar o mesmo `id` devolve a captura que já existe. */
  async create(input: NewCapture): Promise<Capture> {
    const now = this.nowIso();
    const created = input.createdAt && Date.parse(input.createdAt) <= this.clock() + 5 * 60_000 ? input.createdAt : now;
    const rows = await this.sql.query(
      `insert into captures (id, text, kind, tags, created_at, updated_at)
       values (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6)
       on conflict (id) do update set id = captures.id
       returning ${COLUMNS}`,
      [input.id ?? null, input.text, input.kind, extractTags(input.text), created, now],
    );
    return toCapture(rows[0]!);
  }

  async update(id: string, patch: CapturePatch): Promise<Capture | null> {
    const cur = await this.get(id);
    if (!cur) return null;
    const text = patch.text ?? cur.text;
    const kind = patch.kind !== undefined ? patch.kind : cur.kind;
    const rows = await this.sql.query(
      `update captures set text = $2, kind = $3, tags = $4, updated_at = $5 where id = $1 returning ${COLUMNS}`,
      [id, text, kind, extractTags(text), this.nowIso()],
    );
    return rows[0] ? toCapture(rows[0]) : null;
  }

  async bulk(ids: string[], op: BulkAction): Promise<number> {
    const now = this.nowIso();
    const where = "id = any($1::uuid[]) and moved_page_id is null";
    const rows =
      op.action === "archive"
        ? await this.sql.query(`update captures set archived_at = $2, updated_at = $2 where ${where} and archived_at is null returning id`, [ids, now])
        : op.action === "restore"
          ? await this.sql.query(`update captures set archived_at = null, updated_at = $2 where ${where} and archived_at is not null returning id`, [ids, now])
          : await this.sql.query(`update captures set kind = $3, updated_at = $2 where ${where} and archived_at is null returning id`, [ids, now, op.kind]);
    return rows.length;
  }

  /** Marca como movida. Só funciona uma vez: devolve false se já foi movida ou não existe. */
  async markMoved(id: string, pageId: string): Promise<boolean> {
    const rows = await this.sql.query(
      `update captures set moved_page_id = $2, updated_at = $3 where id = $1 and moved_page_id is null returning id`,
      [id, pageId, this.nowIso()],
    );
    return rows.length > 0;
  }
}
