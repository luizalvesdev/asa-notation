import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Icon } from "./icons";
import { parseQuickAdd, type QuickAdd } from "./tasks-logic";

export interface AddTaskHandle {
  open: () => void;
}

interface AddTaskProps {
  label?: string;
  /** Mostra a tecla de atalho ao lado do botão. */
  shortcut?: string;
  /** Versão pequena, para as colunas da semana. */
  compact?: boolean;
  onAdd: (task: QuickAdd) => Promise<boolean>;
}

const HINT = "Escolha a hora ao lado, ou digite 14:00 no começo. /diaria, /uteis ou /semanal no fim repetem a tarefa.";

/** Botão que vira campo de texto. Enter adiciona e mantém aberto; Esc fecha. */
export const AddTask = forwardRef<AddTaskHandle, AddTaskProps>(function AddTask({ label = "Adicionar tarefa", shortcut, compact, onAdd }, ref) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [time, setTime] = useState("");
  const [failed, setFailed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLDivElement>(null);

  const show = () => {
    setOpen(true);
    // O campo só existe depois da renderização.
    requestAnimationFrame(() => input.current?.focus());
  };
  useImperativeHandle(ref, () => ({ open: show }));

  const submit = async () => {
    const parsed = parseQuickAdd(value);
    if (!parsed) return;
    setFailed(false);
    // Hora digitada no começo do texto vale mais que o seletor.
    if (await onAdd({ ...parsed, time: parsed.time ?? (time || null) })) {
      setValue("");
      setTime("");
    } else setFailed(true);
  };

  if (!open) {
    return (
      <button className={`plain task add-task${compact ? " compact" : ""}`} type="button" onClick={show}>
        <Icon name="plus" />
        {label}
        {shortcut && (
          <span className="meta">
            <span className="kbd">{shortcut}</span>
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      ref={form}
      className={`add-task-form${compact ? " compact" : ""}`}
      onBlur={(e) => {
        // Só fecha se o foco saiu do formulário (o seletor de hora também é parte dele) e nada foi preenchido.
        if (!form.current?.contains(e.relatedTarget as Node | null) && value.trim() === "" && time === "") setOpen(false);
      }}
    >
      <div className="add-task-row">
        <input
          ref={input}
          className="add-task-input"
          value={value}
          placeholder={label}
          aria-label={label}
          aria-describedby="add-task-hint"
          title={HINT}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            } else if (e.key === "Escape") {
              setOpen(false);
              setValue("");
              setTime("");
              setFailed(false);
            }
          }}
        />
        <input
          className="add-task-input add-task-time"
          type="time"
          value={time}
          aria-label="Hora da tarefa (opcional)"
          title="Hora da tarefa (opcional)"
          onChange={(e) => setTime(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            } else if (e.key === "Escape") {
              setOpen(false);
              setValue("");
              setTime("");
            }
          }}
        />
      </div>
      {!compact && (
        <span id="add-task-hint" className="add-task-hint">
          {failed ? "Não foi possível adicionar. Tente de novo." : HINT}
        </span>
      )}
      {compact && failed && <span className="add-task-hint">Não foi possível adicionar.</span>}
    </div>
  );
});
