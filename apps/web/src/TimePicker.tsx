import { useRef, useState } from "react";
import { Popover } from "./db-cells";
import { Icon } from "./icons";
import { Presence } from "./Presence";

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

interface TimePickerProps {
  /** "HH:MM" ou "" (sem hora). */
  value: string;
  onChange: (value: string) => void;
  label: string;
  /** Texto do botão quando não há hora. */
  empty?: string;
  /** Mostra "Sem hora" no seletor. */
  clearable?: boolean;
  /** Avisa quando o seletor abre ou fecha (quem o contém não deve fechar enquanto ele está aberto). */
  onOpenChange?: (open: boolean) => void;
  compact?: boolean;
}

/** Seletor de hora por toque/clique: escolhe a hora numa grade e os minutos (de 5 em 5) em outra. Sem digitar. */
export function TimePicker({ value, onChange, label, empty = "Hora", clearable = false, onOpenChange, compact }: TimePickerProps) {
  const [open, setOpenState] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };
  const hour = value.slice(0, 2);
  const minute = value.slice(3, 5);

  return (
    <span ref={anchor} style={{ display: "inline-flex" }}>
      <button
        className={`btn btn-sm ${value ? "btn-sec" : "btn-fan"} tp-trigger${compact ? " compact" : ""}`}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={value ? `${label}: ${value}` : label}
        onClick={() => setOpen(!open)}
      >
        <Icon name="clock" />
        <span className="mono">{value || empty}</span>
      </button>
      <Presence show={open}>
        <Popover anchor={anchor} onClose={() => setOpen(false)} width={236}>
          <div className="tp" role="dialog" aria-label={label}>
            <span className="label">Hora</span>
            <div className="tp-grid">
              {HOURS.map((h) => (
                <button key={h} type="button" className={`tp-cell${h === hour ? " on" : ""}`} aria-pressed={h === hour} onClick={() => onChange(`${h}:${minute || "00"}`)}>
                  {h}
                </button>
              ))}
            </div>
            <span className="label">Minutos</span>
            <div className="tp-grid">
              {MINUTES.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`tp-cell${m === minute ? " on" : ""}`}
                  aria-pressed={m === minute}
                  onClick={() => {
                    onChange(`${hour || "09"}:${m}`);
                    setOpen(false);
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="row" style={{ gap: 8, justifyContent: "space-between" }}>
              {clearable ? (
                <button className="btn btn-fan btn-sm" type="button" disabled={!value} onClick={() => { onChange(""); setOpen(false); }}>
                  Sem hora
                </button>
              ) : (
                <span />
              )}
              <button className="btn btn-pri btn-sm" type="button" disabled={!value} onClick={() => setOpen(false)}>
                OK
              </button>
            </div>
          </div>
        </Popover>
      </Presence>
    </span>
  );
}
