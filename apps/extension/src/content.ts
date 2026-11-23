import { extract, findCourseLinks, parseCoursePage } from "./extract.js";

// Injetado na aba pelo popup. Fica guardado no mundo isolado da extensão; o popup chama em seguida.
const w = window as unknown as {
  __asaExtract: () => unknown;
  __asaCourses: () => unknown;
  __asaFetchCourse: (url: string) => Promise<unknown>;
};
w.__asaExtract = () => extract(window);
w.__asaCourses = () => findCourseLinks(document, location.href);

/** Baixa a página de um curso com a sessão do usuário (só no mesmo site) e devolve as aulas. */
w.__asaFetchCourse = async (url: string) => {
  try {
    const target = new URL(url, location.href);
    if (target.origin !== location.origin) return { ok: false, reason: "other_site" };
    const res = await fetch(target.href, { credentials: "include" });
    // Sessão caída: a Alura manda para outra página (login ou a página pública do curso).
    if (res.redirected && new URL(res.url).origin !== location.origin) return { ok: false, reason: "login" };
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    return parseCoursePage(doc);
  } catch {
    return { ok: false, reason: "network" };
  }
};
