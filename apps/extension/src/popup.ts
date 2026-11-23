import { createApi, errorMessage, folderOptions, type Api, type DateEvent } from "./api.js";
import { ext, loadConfig } from "./browser.js";
import type { Extracted } from "./extract.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const KIND_LABEL: Record<Extracted["kind"], string> = { article: "Artigo", transcript: "Transcrição do vídeo", selection: "Trecho selecionado", course: "Cursos da trilha", lessons: "Aulas do curso" };
const LAST_FOLDER = "lastFolder";

function show(id: string) {
  for (const el of document.querySelectorAll<HTMLElement>("[data-view]")) el.hidden = el.dataset.view !== id;
}

function status(text: string, kind: "error" | "ok" | "" = "") {
  const el = $("status");
  el.textContent = text;
  el.className = kind;
}

async function readTab(): Promise<Extracted> {
  const [tab] = await ext().tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined || !/^https?:/.test(tab.url ?? "")) throw new Error("page");
  await ext().scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
  const [res] = await ext().scripting.executeScript({ target: { tabId: tab.id }, func: () => (window as unknown as { __asaExtract: () => unknown }).__asaExtract() });
  return res!.result as Extracted;
}

async function fillFolders(api: Api, kind: Extracted["kind"]) {
  const select = $<HTMLSelectElement>("folder");
  // Índice de curso tem pasta própria (o servidor cria Minha Carreira > Alura); a última pasta escolhida vale só para o resto.
  if (kind === "course" || kind === "lessons") select.options[0]!.text = "💼 Minha Carreira › Alura";
  const { [LAST_FOLDER]: last } = await ext().storage.local.get([LAST_FOLDER]);
  for (const opt of folderOptions(await api.tree())) select.add(new Option(opt.label, opt.id));
  if (kind !== "course" && kind !== "lessons" && typeof last === "string" && [...select.options].some((o) => o.value === last)) select.value = last;
}

function eventLabel(e: DateEvent): string {
  const [y, m, d] = e.date.split("-");
  const day = new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
  return `${day}${e.time ? ` ${e.time}` : ""}`;
}

async function importDates(api: Api, page: Extracted) {
  const button = $<HTMLButtonElement>("dates");
  button.disabled = true;
  status("Procurando datas…");
  try {
    const { events } = await api.dates({ url: page.url, title: page.title, text: page.text });
    status("");
    show("dates");
    const list = $("events");
    list.replaceChildren();
    if (events.length === 0) {
      list.textContent = page.kind === "selection" ? "Nenhuma data no trecho selecionado." : "Nenhuma data daqui para frente nesta página. Dica: selecione só a parte da agenda e tente de novo.";
      $<HTMLButtonElement>("create").hidden = true;
      return;
    }
    for (const [i, e] of events.entries()) {
      const row = document.createElement("label");
      row.className = "event";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = !e.exists;
      box.disabled = e.exists;
      box.dataset.index = String(i);
      const text = document.createElement("span");
      const when = document.createElement("small");
      when.textContent = eventLabel(e) + (e.exists ? " · já é tarefa" : "");
      text.append(document.createTextNode(e.title), document.createElement("br"), when);
      row.append(box, text);
      list.append(row);
    }
    const create = $<HTMLButtonElement>("create");
    const refresh = () => {
      const n = list.querySelectorAll("input:checked:not(:disabled)").length;
      create.textContent = n === 1 ? "Criar 1 tarefa" : `Criar ${n} tarefas`;
      create.disabled = n === 0;
    };
    list.onchange = refresh;
    refresh();
    create.hidden = false;
    create.onclick = async () => {
      create.disabled = true;
      const chosen = [...list.querySelectorAll<HTMLInputElement>("input:checked:not(:disabled)")].map((b) => events[Number(b.dataset.index)]!);
      let done = 0;
      try {
        for (const e of chosen) {
          await api.createTask({ title: e.title, date: e.date, time: e.time });
          done++;
        }
        status(done === 1 ? "1 tarefa criada no Asa." : `${done} tarefas criadas no Asa.`, "ok");
        create.hidden = true;
        for (const b of list.querySelectorAll<HTMLInputElement>("input")) b.disabled = true;
      } catch (err) {
        status(`${done > 0 ? `${done} criadas; ` : ""}${errorMessage(err)}`, "error");
        create.disabled = false;
      }
    };
  } catch (err) {
    status(errorMessage(err), "error");
  } finally {
    button.disabled = false;
  }
}

async function main() {
  $("options").onclick = () => void ext().runtime.openOptionsPage();
  const config = await loadConfig();
  if (!config) {
    show("setup");
    $("setup-open").onclick = () => void ext().runtime.openOptionsPage().then(() => window.close());
    return;
  }
  const api = createApi(config);
  show("loading");

  let page: Extracted;
  try {
    page = await readTab();
  } catch {
    show("blocked");
    return;
  }

  show("clip");
  $("kind").textContent = KIND_LABEL[page.kind];
  $<HTMLInputElement>("title").value = page.title;
  $("size").textContent = `${page.markdown.split(/\s+/).filter(Boolean).length.toLocaleString("pt-BR")} palavras`;
  fillFolders(api, page.kind).catch((err) => status(errorMessage(err), "error"));

  $("dates").onclick = () => void importDates(api, page);
  $("back").onclick = () => {
    status("");
    show("clip");
  };

  $<HTMLFormElement>("clip-form").onsubmit = async (ev) => {
    ev.preventDefault();
    const save = $<HTMLButtonElement>("save");
    save.disabled = true;
    status("Salvando…");
    const folder = $<HTMLSelectElement>("folder").value || null;
    try {
      const saved = await api.clip({ url: page.url, title: $<HTMLInputElement>("title").value.trim() || page.title, markdown: page.markdown, kind: page.kind, parentId: folder });
      if (page.kind !== "course" && page.kind !== "lessons") await ext().storage.local.set({ [LAST_FOLDER]: folder ?? "" });
      status("Salvo no Asa.", "ok");
      const open = $<HTMLAnchorElement>("open");
      open.href = api.pageLink(saved.id);
      open.hidden = false;
      open.onclick = (e) => {
        e.preventDefault();
        void ext().tabs.create({ url: open.href }).then(() => window.close());
      };
    } catch (err) {
      status(errorMessage(err), "error");
      save.disabled = false;
    }
  };
}

void main();
