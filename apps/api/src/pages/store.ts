import { randomBytes } from "node:crypto";
import { generateKeyBetween } from "fractional-indexing";
import type { Row, SqlClient } from "../sql.js";
import type {
  MoveResult,
  MoveTarget,
  NewPage,
  Page,
  PagePatch,
  PageRef,
  SearchHit,
  TrashItem,
  TreeNode,
  UpdateResult,
  RowItem,
  PublicPage,
  VersionFull,
  VersionItem,
} from "./model.js";
import { extractLinks, extractText, normalizeTitle } from "./text.js";

const COLUMNS =
  "id, parent_id, title, icon, favorite, position, body, kind, props, schema, rev, created_at, updated_at, deleted_at";

const SNIPPET_START = "\u0001";
const SNIPPET_STOP = "\u0002";
const MAX_SEARCH_TERMS = 8;

function iso(value: unknown): string {
  return new Date(value as string | Date).toISOString();
}

function toPage(row: Row): Page {
  return {
    id: row.id as string,
    parentId: (row.parent_id as string | null) ?? null,
    title: row.title as string,
    icon: (row.icon as string | null) ?? null,
    favorite: row.favorite as boolean,
    position: row.position as string,
    body: row.body ?? null,
    kind: row.kind as Page["kind"],
    props: (row.props as Record<string, unknown> | null) ?? {},
    schema: row.schema ?? null,
    rev: Number(row.rev),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    deletedAt: row.deleted_at == null ? null : iso(row.deleted_at),
  };
}

function toRef(row: Row): PageRef {
  return { id: row.id as string, title: row.title as string, icon: (row.icon as string | null) ?? null };
}

/** Chave entre duas vizinhas. Se elas forem iguais (chaves duplicadas), cai para depois da primeira. */
function keyBetween(a: string | null, b: string | null): string {
  try {
    return generateKeyBetween(a, b);
  } catch {
    return generateKeyBetween(a, null);
  }
}

/** Termos de busca seguros para tsquery: só letras e números, com prefixo. */
export function searchQuery(raw: string): string | null {
  const terms = (raw.match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, MAX_SEARCH_TERMS);
  return terms.length === 0 ? null : terms.map((t) => `${t}:*`).join(" & ");
}

export class PgPageStore {
  constructor(
    private readonly sql: SqlClient,
    private readonly clock: () => number = Date.now,
  ) {}

  private nowIso(): string {
    return new Date(this.clock()).toISOString();
  }

  async tree(): Promise<TreeNode[]> {
    const rows = await this.sql.query(
      `select id, parent_id, title, icon, favorite, position, kind from pages
        where deleted_at is null and kind <> 'row' order by position asc, created_at asc, id asc`,
    );
    return rows.map((row) => ({
      id: row.id as string,
      parentId: (row.parent_id as string | null) ?? null,
      title: row.title as string,
      icon: (row.icon as string | null) ?? null,
      favorite: row.favorite as boolean,
      position: row.position as string,
      kind: row.kind as Page["kind"],
    }));
  }

  /** Esquema de uma database (ou null se o id não é de uma database ativa). */
  async schemaOf(id: string): Promise<unknown | null> {
    const rows = await this.sql.query(`select schema from pages where id = $1 and kind = 'database' and deleted_at is null`, [id]);
    return rows[0] ? (rows[0].schema ?? null) : null;
  }

  /** Linhas de uma database, da mais antiga para a mais nova. */
  async rows(databaseId: string, limit = 2000): Promise<RowItem[]> {
    const rows = await this.sql.query(
      `select id, title, icon, props, created_at, updated_at from pages
        where parent_id = $1 and kind = 'row' and deleted_at is null order by created_at asc, id asc limit $2`,
      [databaseId, limit],
    );
    return rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      icon: (r.icon as string | null) ?? null,
      props: (r.props as Record<string, unknown> | null) ?? {},
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
    }));
  }

  async get(id: string): Promise<Page | null> {
    const rows = await this.sql.query(`select ${COLUMNS} from pages where id = $1 and deleted_at is null`, [id]);
    return rows[0] ? toPage(rows[0]) : null;
  }

  private async lastPosition(parentId: string | null, excludeId?: string): Promise<string | null> {
    const rows = await this.sql.query(
      `select max(position) as last from pages
        where parent_id is not distinct from $1::uuid and deleted_at is null and ($2::uuid is null or id <> $2::uuid)`,
      [parentId, excludeId ?? null],
    );
    return (rows[0]?.last as string | null | undefined) ?? null;
  }

  /** Cria no fim dos irmãos. Devolve null se o pai não existe (ou está na lixeira). */
  async create(input: NewPage): Promise<Page | null> {
    if (input.parentId && !(await this.get(input.parentId))) return null;
    const position = keyBetween(await this.lastPosition(input.parentId), null);
    const text = input.body === null ? "" : extractText(input.body);
    const links = extractLinks(text);
    const now = this.nowIso();
    const rows = await this.sql.query(
      `with p as (
         insert into pages (parent_id, title, icon, position, body, body_text, created_at, updated_at, kind, props, schema)
         values ($1, $2, $3, $4, $5::jsonb, $6, $7, $7, $9, $10::jsonb, $11::jsonb)
         returning ${COLUMNS}
       ), l as (
         insert into page_links (from_page, to_title)
         select p.id, t from p, unnest($8::text[]) as t
         on conflict do nothing
         returning 1
       )
       select * from p`,
      [input.parentId, input.title, input.icon, position, input.body === null ? null : JSON.stringify(input.body), text, now, links, input.kind ?? "page", JSON.stringify(input.props ?? {}), input.schema === undefined ? null : JSON.stringify(input.schema)],
    );
    return toPage(rows[0]!);
  }

  /**
   * Guarda o estado atual da página como versão, no máximo a cada 10 minutos de edição e só se o conteúdo
   * vai mudar. O histórico fica com as últimas 100 versões.
   */
  private async snapshot(id: string, newBody: unknown, baseRev: number | undefined): Promise<void> {
    const now = this.nowIso();
    const inserted = await this.sql.query(
      `insert into page_versions (page_id, title, body, body_text, created_at)
       select id, title, body, body_text, $2 from pages
        where id = $1 and deleted_at is null and body is not null and body is distinct from $3::jsonb
          and ($4::bigint is null or rev = $4::bigint)
          and not exists (select 1 from page_versions v where v.page_id = pages.id and v.created_at > $2::timestamptz - interval '10 minutes')
       returning id`,
      [id, now, JSON.stringify(newBody), baseRev ?? null],
    );
    if (inserted.length > 0) {
      await this.sql.query(`delete from page_versions where page_id = $1 and id not in (select id from page_versions where page_id = $1 order by id desc limit 100)`, [id]);
    }
  }

  async versions(pageId: string): Promise<VersionItem[]> {
    const rows = await this.sql.query(
      `select id, title, created_at, left(body_text, 140) as excerpt from page_versions where page_id = $1 order by id desc limit 50`,
      [pageId],
    );
    return rows.map((r) => ({ id: Number(r.id), title: r.title as string, createdAt: iso(r.created_at), excerpt: r.excerpt as string }));
  }

  async version(pageId: string, versionId: number): Promise<VersionFull | null> {
    const rows = await this.sql.query(`select id, title, body, created_at from page_versions where page_id = $1 and id = $2`, [pageId, versionId]);
    const r = rows[0];
    return r ? { id: Number(r.id), title: r.title as string, body: r.body, createdAt: iso(r.created_at) } : null;
  }

  /** Volta a página para uma versão. O estado de agora vira uma versão antes, para dar para desfazer. */
  async restoreVersion(pageId: string, versionId: number): Promise<Page | null> {
    const version = await this.version(pageId, versionId);
    if (!version || !(await this.get(pageId))) return null;
    const now = this.nowIso();
    await this.sql.query(
      `insert into page_versions (page_id, title, body, body_text, created_at)
       select id, title, body, body_text, $2 from pages where id = $1 and body is not null`,
      [pageId, now],
    );
    const result = await this.update(pageId, { title: version.title, body: version.body });
    return result.kind === "ok" ? result.page : null;
  }

  // ---- link público ------------------------------------------------------------

  async share(pageId: string): Promise<{ slug: string; views: number } | null> {
    if (!(await this.get(pageId))) return null;
    const slug = randomBytes(9).toString("base64url");
    const rows = await this.sql.query(
      `insert into page_shares (page_id, slug, created_at) values ($1, $2, $3)
       on conflict (page_id) do update set page_id = page_shares.page_id returning slug, views`,
      [pageId, slug, this.nowIso()],
    );
    return { slug: rows[0]!.slug as string, views: Number(rows[0]!.views) };
  }

  async shareOf(pageId: string): Promise<{ slug: string; views: number } | null> {
    const rows = await this.sql.query(`select slug, views from page_shares where page_id = $1`, [pageId]);
    return rows[0] ? { slug: rows[0].slug as string, views: Number(rows[0].views) } : null;
  }

  async unshare(pageId: string): Promise<boolean> {
    return (await this.sql.query(`delete from page_shares where page_id = $1 returning page_id`, [pageId])).length > 0;
  }

  /** Página pelo slug público, contando a visita. Só devolve o que um leitor externo pode ver. */
  async publicPage(slug: string): Promise<PublicPage | null> {
    const rows = await this.sql.query(
      `with s as (update page_shares set views = views + 1 where slug = $1
                    and exists (select 1 from pages p where p.id = page_id and p.deleted_at is null) returning page_id)
       select p.title, p.icon, p.body, p.updated_at from pages p join s on s.page_id = p.id`,
      [slug],
    );
    const r = rows[0];
    return r ? { title: r.title as string, icon: (r.icon as string | null) ?? null, body: r.body ?? null, updatedAt: iso(r.updated_at) } : null;
  }

  async update(id: string, patch: PagePatch, baseRev?: number): Promise<UpdateResult> {
    const sets: string[] = ["rev = nextval('change_seq')", "updated_at = $2"];
    const params: unknown[] = [id, this.nowIso(), baseRev ?? null];
    const add = (column: string, value: unknown, cast = "") => {
      params.push(value);
      sets.push(`${column} = $${params.length}${cast}`);
    };
    if (patch.title !== undefined) add("title", patch.title);
    if (patch.icon !== undefined) add("icon", patch.icon);
    if (patch.favorite !== undefined) add("favorite", patch.favorite);
    if (patch.schema !== undefined) add("schema", JSON.stringify(patch.schema), "::jsonb");
    if (patch.props !== undefined) {
      params.push(JSON.stringify(patch.props));
      // Junta com o que já existe e tira as chaves nulas (null = apagar o valor).
      sets.push(`props = jsonb_strip_nulls(props || $${params.length}::jsonb)`);
    }

    let links: string[] | null = null;
    if (patch.body !== undefined) {
      await this.snapshot(id, patch.body, baseRev);
      const text = extractText(patch.body);
      links = extractLinks(text);
      add("body", JSON.stringify(patch.body), "::jsonb");
      add("body_text", text);
    }
    params.push(links ?? []);
    const linksParam = `$${params.length}::text[]`;
    const replaceLinks = links !== null;

    const rows = await this.sql.query(
      `with u as (
         update pages set ${sets.join(", ")}
          where id = $1 and deleted_at is null and ($3::bigint is null or rev = $3::bigint)
          returning ${COLUMNS}
       ), d as (
         delete from page_links
          where ${replaceLinks ? "true" : "false"} and from_page = $1 and exists (select 1 from u)
            and to_title <> all(${linksParam})
          returning 1
       ), l as (
         insert into page_links (from_page, to_title)
         select u.id, t from u, unnest(${linksParam}) as t where ${replaceLinks ? "true" : "false"}
         on conflict do nothing
         returning 1
       )
       select * from u`,
      params,
    );
    if (rows[0]) return { kind: "ok", page: toPage(rows[0]) };
    const current = await this.get(id);
    return current ? { kind: "conflict", page: current } : { kind: "not_found" };
  }

  async move(id: string, target: MoveTarget): Promise<MoveResult> {
    const current = await this.get(id);
    if (!current) return { kind: "not_found" };
    // Linha de database fica na database: mover é só pelo título/propriedades.
    if (current.kind === "row") return { kind: "row_locked" };
    if (target.parentId) {
      if (!(await this.get(target.parentId))) return { kind: "parent_not_found" };
      const cycle = await this.sql.query(
        `with recursive d as (
           select id from pages where id = $1
           union all
           select p.id from pages p join d on p.parent_id = d.id
         ) select 1 as hit from d where id = $2`,
        [id, target.parentId],
      );
      if (cycle.length > 0) return { kind: "cycle" };
    }

    const siblings = await this.sql.query(
      `select id, position from pages
        where parent_id is not distinct from $1::uuid and deleted_at is null and id <> $2
        order by position asc, created_at asc, id asc`,
      [target.parentId, id],
    );
    let position: string;
    const anchorId = target.before ?? target.after;
    if (anchorId === undefined) {
      position = keyBetween((siblings[siblings.length - 1]?.position as string | undefined) ?? null, null);
    } else {
      const index = siblings.findIndex((row) => row.id === anchorId);
      if (index < 0) return { kind: "anchor_invalid" };
      const at = (i: number) => (siblings[i]?.position as string | undefined) ?? null;
      position = target.before !== undefined ? keyBetween(at(index - 1), at(index)) : keyBetween(at(index), at(index + 1));
    }

    const rows = await this.sql.query(
      `update pages set parent_id = $2, position = $3, rev = nextval('change_seq'), updated_at = $4
        where id = $1 and deleted_at is null
        returning ${COLUMNS}`,
      [id, target.parentId, position, this.nowIso()],
    );
    return rows[0] ? { kind: "ok", page: toPage(rows[0]) } : { kind: "not_found" };
  }

  /** Move a página e toda a subárvore para a lixeira. Devolve quantas páginas foram. */
  async softDelete(id: string): Promise<number> {
    const now = this.nowIso();
    const rows = await this.sql.query(
      `with recursive d as (
         select id from pages where id = $1 and deleted_at is null
         union all
         select p.id from pages p join d on p.parent_id = d.id where p.deleted_at is null
       )
       update pages set deleted_at = $2, updated_at = $2, rev = nextval('change_seq')
        where id in (select id from d)
        returning id`,
      [id, now],
    );
    return rows.length;
  }

  /** Raízes da lixeira: o que foi apagado direto, sem o conteúdo que veio junto. */
  async trash(limit = 200): Promise<TrashItem[]> {
    const rows = await this.sql.query(
      `select p.id, p.title, p.icon, p.deleted_at, par.title as parent_title
         from pages p left join pages par on par.id = p.parent_id
        where p.deleted_at is not null
          and (p.parent_id is null or par.deleted_at is distinct from p.deleted_at)
        order by p.deleted_at desc, p.id asc
        limit $1`,
      [limit],
    );
    return rows.map((row) => ({
      id: row.id as string,
      title: row.title as string,
      icon: (row.icon as string | null) ?? null,
      deletedAt: iso(row.deleted_at),
      parentTitle: (row.parent_title as string | null) ?? null,
    }));
  }

  /** Restaura a página e o que foi apagado junto com ela. Se o pai continua apagado, vai para a raiz. */
  async restore(id: string): Promise<Page | null> {
    const now = this.nowIso();
    const rows = await this.sql.query(
      `with recursive d as (
         select id, deleted_at from pages where id = $1 and deleted_at is not null
         union all
         select p.id, p.deleted_at from pages p join d on p.parent_id = d.id where p.deleted_at = d.deleted_at
       )
       update pages
          set deleted_at = null, updated_at = $2, rev = nextval('change_seq'),
              parent_id = case
                when pages.id = $1 and pages.kind <> 'row' and not exists (
                  select 1 from pages par where par.id = pages.parent_id and par.deleted_at is null
                ) then null
                else pages.parent_id end
        where id in (select id from d)
        returning ${COLUMNS}`,
      [id, now],
    );
    const root = rows.find((row) => row.id === id);
    return root ? toPage(root) : null;
  }

  async search(raw: string, limit: number): Promise<SearchHit[]> {
    const query = searchQuery(raw);
    if (!query) return [];
    // q casa sem acento (usa o índice); qh mantém os acentos para destacar o trecho original.
    const rows = await this.sql.query(
      `select p.id, p.title, p.icon,
              to_tsvector('portuguese', asa_unaccent(p.title)) @@ q as in_title,
              ts_headline('portuguese', p.body_text, qh, $3) as snippet
         from pages p,
              to_tsquery('portuguese', asa_unaccent($1)) q,
              to_tsquery('portuguese', $1) qh
        where p.deleted_at is null
          and to_tsvector('portuguese', asa_unaccent(p.title || ' ' || p.body_text)) @@ q
        order by in_title desc,
                 ts_rank(to_tsvector('portuguese', asa_unaccent(p.title || ' ' || p.body_text)), q) desc,
                 p.updated_at desc, p.id asc
        limit $2`,
      [
        query,
        limit,
        `StartSel=${SNIPPET_START},StopSel=${SNIPPET_STOP},MaxFragments=1,MaxWords=20,MinWords=8,ShortWord=2`,
      ],
    );
    return rows.map((row) => ({
      ...toRef(row),
      matchIn: row.in_title ? "title" : "content",
      snippet: row.in_title ? "" : (row.snippet as string),
    }));
  }

  /** Páginas que citam esta com [[Título]]. */
  async backlinks(id: string, limit = 100): Promise<PageRef[]> {
    const page = await this.get(id);
    if (!page) return [];
    const title = normalizeTitle(page.title);
    if (!title) return [];
    const rows = await this.sql.query(
      `select s.id, s.title, s.icon
         from page_links l join pages s on s.id = l.from_page
        where l.to_title = $1 and s.deleted_at is null and s.id <> $2
        order by s.updated_at desc, s.id asc
        limit $3`,
      [title, id, limit],
    );
    return rows.map(toRef);
  }
}
