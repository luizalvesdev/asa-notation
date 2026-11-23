import { ProviderError } from "../ai/anthropic.js";
import type { AiProvider } from "../ai/provider.js";
import { markdownToDoc } from "../chat/markdown.js";
import { localParts } from "../notifications/checkins.js";
import { CAREER_ICON, CAREER_TITLE } from "../pages/model.js";
import type { PgPageStore } from "../pages/store.js";
import { badRequest, isRecord, isUuid, json, type Route } from "../routing.js";
import type { PgSettingsStore } from "../settings/store.js";
import type { SqlClient } from "../sql.js";
import { NothingToRead, extractDates } from "./dates.js";
import { normalizeSourceUrl } from "./url.js";

/**
 * Recortes da extensão do navegador: um artigo, a transcrição de uma aula ou um trecho selecionado vira página;
 * uma agenda vira lista de datas para o usuário escolher quais entram como tarefa.
 * A extensão usa um token de API de escrita.
 */

/** Pasta raiz onde caem os recortes quando a extensão não escolhe outra. */
export const DEFAULT_FOLDER = "Leituras";
/** Pasta, dentro de Minha Carreira, dos cursos salvos a partir da Alura. */
const COURSES_SITE = "Alura";
const MAX_MARKDOWN = 300_000;
const MAX_TITLE = 200;
const MAX_URL = 2000;

interface Deps {
  sql: SqlClient;
  pages: PgPageStore;
  settings: PgSettingsStore;
  ai?: AiProvider;
}

const validUrl = (v: unknown): v is string => typeof v === "string" && v.length <= MAX_URL && /^https?:\/\/\S+$/.test(v);

export function clipRoutes({ sql, pages, settings, ai }: Deps): Route[] {
  /**
   * Onde o recorte cai quando o usuário não escolhe pasta: índice de curso vai para Minha Carreira > Alura,
   * o resto para a pasta "Leituras" da raiz. As pastas são criadas na primeira vez.
   */
  async function defaultFolder(kind: unknown): Promise<string> {
    if (kind === "course" || kind === "lessons") {
      const career = await pages.ensureSection("career", { title: CAREER_TITLE, icon: CAREER_ICON });
      const rows = await sql.query(
        `select id from pages where parent_id = $1 and deleted_at is null and kind = 'page' and lower(title) = lower($2) order by created_at limit 1`,
        [career.id, COURSES_SITE],
      );
      const found = rows[0]?.id as string | undefined;
      if (found) return found;
      return (await pages.create({ parentId: career.id, title: COURSES_SITE, icon: "🎓", body: null }))!.id;
    }
    const rows = await sql.query(
      `select id from pages where parent_id is null and deleted_at is null and kind = 'page' and lower(title) = lower($1) order by created_at limit 1`,
      [DEFAULT_FOLDER],
    );
    const found = rows[0]?.id as string | undefined;
    if (found) return found;
    const created = await pages.create({ parentId: null, title: DEFAULT_FOLDER, icon: "📚", body: null });
    return created!.id;
  }

  return [
    {
      method: "POST",
      pattern: /^\/clips$/,
      access: "session",
      handle: async ({ req }) => {
        const body = isRecord(req.body) ? req.body : {};
        const title = typeof body.title === "string" ? body.title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE) : "";
        const markdown = typeof body.markdown === "string" ? body.markdown : "";
        const parentId = body.parentId ?? null;
        if (!title) return badRequest("invalid_title");
        if (!validUrl(body.url)) return badRequest("invalid_url");
        if (markdown.trim() === "" || markdown.length > MAX_MARKDOWN) return badRequest("invalid_content");
        if (parentId !== null && !isUuid(parentId)) return badRequest("invalid_parent");

        const source = `Fonte: [${new URL(body.url).hostname}](${body.url})`;
        const doc = markdownToDoc(`${source}\n\n${markdown}`);
        const isCourse = body.kind === "course" || body.kind === "lessons";
        const target = parentId ?? (await defaultFolder(body.kind));
        const sourceUrl = isCourse ? normalizeSourceUrl(body.url) : null;
        // Salvar o mesmo curso de novo não duplica: devolve a página que já existe naquele lugar.
        if (sourceUrl) {
          const same = await sql.query(
            `select id, title, parent_id from pages where parent_id = $1 and deleted_at is null and kind = 'page' and props->>'sourceUrl' = $2 order by created_at limit 1`,
            [target, sourceUrl],
          );
          if (same[0]) return json(200, { existed: true, page: { id: same[0].id as string, title: same[0].title as string, parentId: same[0].parent_id as string } });
        }
        const page = await pages.create({ parentId: target, ...(sourceUrl ? { props: { sourceUrl } } : {}), title, icon: body.kind === "transcript" ? "🎬" : body.kind === "course" ? "🎓" : body.kind === "lessons" ? "📘" : null, body: doc });
        if (!page) return json(404, { error: "parent_not_found" });
        return json(201, { page: { id: page.id, title: page.title, parentId: page.parentId } });
      },
    },
    {
      method: "POST",
      pattern: /^\/clips\/dates$/,
      access: "session",
      handle: async ({ req, now }) => {
        const body = isRecord(req.body) ? req.body : {};
        const text = typeof body.text === "string" ? body.text : "";
        const title = typeof body.title === "string" ? body.title.slice(0, MAX_TITLE) : "";
        const url = validUrl(body.url) ? body.url : "";
        const model = ai ? await ai.forTurn() : null;
        if (!model) return json(409, { error: "ai_not_configured" });
        const { timezone } = await settings.get();
        const today = localParts(now, timezone).date;
        try {
          const events = await extractDates(model, { title, url, text, today, timezone });
          const exists = events.length === 0 ? [] : await sql.query(
            `select e.i::int as i from unnest($1::text[], $2::date[]) with ordinality as e(title, d, i)
              where exists (select 1 from tasks t where lower(t.title) = lower(e.title) and t.due_date = e.d)`,
            [events.map((e) => e.title), events.map((e) => e.date)],
          );
          const taken = new Set(exists.map((r) => Number(r.i) - 1));
          return json(200, { today, events: events.map((e, i) => ({ ...e, exists: taken.has(i) })) });
        } catch (err) {
          if (err instanceof NothingToRead) return badRequest("text_too_short");
          if (err instanceof ProviderError) return json(err.status === 429 ? 429 : 502, { error: err.status === 429 ? "ai_busy" : "ai_failed" });
          throw err;
        }
      },
    },
  ];
}
