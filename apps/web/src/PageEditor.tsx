import type { Page } from "@asa/core";
import { Placeholder } from "@tiptap/extensions";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api.js";

type SaveState = "saved" | "saving" | "error";

interface Props {
  page: Page;
  remoteRev: number | undefined;
  onSaved: (page: Page) => void;
}

const SAVE_DELAY_MS = 700;
const RETRY_DELAY_MS = 3000;

const extensions = [
  StarterKit,
  TaskList,
  TaskItem.configure({ nested: true }),
  Placeholder.configure({ placeholder: "Escreva algo…" }),
];

function Toolbar({ editor }: { editor: Editor }) {
  const item = (label: string, active: boolean, run: () => void, title: string) => (
    <button
      key={title}
      type="button"
      className={active ? "tool active" : "tool"}
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      {label}
    </button>
  );
  const chain = () => editor.chain().focus();
  return (
    <div className="toolbar" role="toolbar" aria-label="Formatação">
      {item("H1", editor.isActive("heading", { level: 1 }), () => chain().toggleHeading({ level: 1 }).run(), "Título 1")}
      {item("H2", editor.isActive("heading", { level: 2 }), () => chain().toggleHeading({ level: 2 }).run(), "Título 2")}
      {item("H3", editor.isActive("heading", { level: 3 }), () => chain().toggleHeading({ level: 3 }).run(), "Título 3")}
      {item("B", editor.isActive("bold"), () => chain().toggleBold().run(), "Negrito")}
      {item("I", editor.isActive("italic"), () => chain().toggleItalic().run(), "Itálico")}
      {item("•", editor.isActive("bulletList"), () => chain().toggleBulletList().run(), "Lista")}
      {item("1.", editor.isActive("orderedList"), () => chain().toggleOrderedList().run(), "Lista numerada")}
      {item("☑", editor.isActive("taskList"), () => chain().toggleTaskList().run(), "Lista de tarefas")}
      {item("”", editor.isActive("blockquote"), () => chain().toggleBlockquote().run(), "Citação")}
      {item("</>", editor.isActive("codeBlock"), () => chain().toggleCodeBlock().run(), "Bloco de código")}
      {item("—", false, () => chain().setHorizontalRule().run(), "Divisor")}
    </div>
  );
}

export function PageEditor({ page, remoteRev, onSaved }: Props) {
  const [title, setTitle] = useState(page.title);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [conflict, setConflict] = useState<Page | null>(null);

  const baseRev = useRef(page.rev);
  const titleRef = useRef(page.title);
  const dirty = useRef({ title: false, body: false });
  const inFlight = useRef(false);
  const rerun = useRef(false);
  const conflictRef = useRef<Page | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const editorRef = useRef<Editor | null>(null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const flush = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current);
    const editor = editorRef.current;
    if (!editor || conflictRef.current) return;
    if (inFlight.current) {
      rerun.current = true;
      return;
    }
    const snapshot = { ...dirty.current };
    if (!snapshot.title && !snapshot.body) return;

    const patch: { title?: string; body?: unknown } = {};
    if (snapshot.title) patch.title = titleRef.current;
    if (snapshot.body) patch.body = editor.getJSON();
    dirty.current = { title: false, body: false };
    inFlight.current = true;
    setSaveState("saving");

    let failed = false;
    try {
      const saved = await api.updatePage(page.id, baseRev.current, patch);
      baseRev.current = saved.rev;
      onSavedRef.current(saved);
      setSaveState(dirty.current.title || dirty.current.body ? "saving" : "saved");
    } catch (err) {
      failed = true;
      dirty.current = {
        title: dirty.current.title || snapshot.title,
        body: dirty.current.body || snapshot.body,
      };
      setSaveState("error");
      if (err instanceof ApiError && err.status === 409) {
        const current = (err.body as { page?: Page } | null)?.page ?? null;
        conflictRef.current = current;
        setConflict(current);
      } else if (!(err instanceof ApiError && err.status === 401)) {
        timer.current = window.setTimeout(() => void flush(), RETRY_DELAY_MS);
      }
    } finally {
      inFlight.current = false;
      const pending = rerun.current || dirty.current.title || dirty.current.body;
      rerun.current = false;
      if (pending && !failed && !conflictRef.current) {
        timer.current = window.setTimeout(() => void flush(), 0);
      }
    }
  }, [page.id]);

  const schedule = useCallback(() => {
    window.clearTimeout(timer.current);
    setSaveState("saving");
    timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS);
  }, [flush]);

  const editor = useEditor({
    extensions,
    content: page.body ?? undefined,
    editorProps: { attributes: { class: "prose", "aria-label": "Conteúdo da página" } },
    onUpdate: () => {
      dirty.current.body = true;
      schedule();
    },
  });
  editorRef.current = editor;

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      void flush();
    };
  }, [flush]);

  useEffect(() => {
    if (remoteRev === undefined || remoteRev <= baseRev.current) return;
    if (dirty.current.title || dirty.current.body || inFlight.current || conflictRef.current) return;
    let cancelled = false;
    api.getPage(page.id).then(
      (fresh) => {
        if (cancelled || fresh.rev <= baseRev.current) return;
        if (dirty.current.title || dirty.current.body || inFlight.current) return;
        baseRev.current = fresh.rev;
        titleRef.current = fresh.title;
        setTitle(fresh.title);
        editorRef.current?.commands.setContent(fresh.body ?? "", { emitUpdate: false });
        onSavedRef.current(fresh);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [remoteRev, page.id]);

  const onTitleChange = (value: string) => {
    setTitle(value);
    titleRef.current = value;
    dirty.current.title = true;
    schedule();
  };

  const keepMine = () => {
    if (!conflictRef.current) return;
    baseRev.current = conflictRef.current.rev;
    conflictRef.current = null;
    setConflict(null);
    dirty.current = { title: true, body: true };
    void flush();
  };

  const useServer = () => {
    const server = conflictRef.current;
    if (!server) return;
    baseRev.current = server.rev;
    titleRef.current = server.title;
    setTitle(server.title);
    editorRef.current?.commands.setContent(server.body ?? "", { emitUpdate: false });
    dirty.current = { title: false, body: false };
    conflictRef.current = null;
    setConflict(null);
    setSaveState("saved");
    onSavedRef.current(server);
  };

  return (
    <article className="page">
      {conflict && (
        <div className="conflict" role="alert">
          <span>Esta página foi alterada em outro lugar.</span>
          <button onClick={keepMine}>Manter a minha versão</button>
          <button onClick={useServer}>Usar a versão salva</button>
        </div>
      )}
      <div className="status" aria-live="polite">
        {saveState === "saving" ? "Salvando…" : saveState === "error" ? "Erro ao salvar" : "Salvo"}
      </div>
      <input
        className="page-title"
        placeholder="Sem título"
        aria-label="Título"
        value={title}
        autoFocus={page.title === ""}
        maxLength={500}
        onChange={(e) => onTitleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            editorRef.current?.chain().focus("start").run();
          }
        }}
      />
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </article>
  );
}
