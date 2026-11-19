import { useRef, useState } from "react";
import { Popover } from "./db-cells";
import { Presence } from "./Presence";
import { Icon } from "./icons";

const EMOJIS = ["📄", "📝", "📚", "📖", "📓", "🗒️", "🗂️", "📌", "⭐", "💡", "🎯", "🚀", "🧠", "🔬", "🧪", "💻", "⚙️", "🛠️", "🔒", "🔑", "📊", "📈", "🗓️", "⏰", "✅", "❤️", "🔥", "🌱", "🌍", "🏠", "🎵", "🎬", "🍎", "☕", "✈️", "🏃", "💰", "🧾", "📦", "🔗"];

/** Pelo menos um, no máximo dois "caracteres" visíveis (um emoji pode ter vários códigos). */
export function validIcon(value: string): boolean {
  const text = value.trim();
  if (text === "" || [...text].length > 16) return false;
  const segments = typeof Intl.Segmenter === "function" ? [...new Intl.Segmenter("pt-BR", { granularity: "grapheme" }).segment(text)].length : [...text].length;
  return segments <= 2;
}

interface IconPickerProps {
  icon: string | null;
  onChange: (icon: string | null) => void;
}

export function IconPicker({ icon, onChange }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const anchor = useRef<HTMLButtonElement>(null);
  const pick = (value: string | null) => {
    onChange(value);
    setOpen(false);
  };
  return (
    <>
      <button ref={anchor} className="btn btn-fan btn-ico btn-sm" type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={icon ? "Trocar ícone da página" : "Adicionar ícone à página"} title={icon ? "Trocar ícone" : "Adicionar ícone"} onClick={() => setOpen((v) => !v)} style={{ fontSize: icon ? 18 : 12 }}>
        {icon ? <span className="page-emoji" style={{ fontSize: "calc(16px * var(--fs, 1))" }}>{icon}</span> : <Icon name="smile" />}
      </button>
      <Presence show={open}><Popover anchor={anchor} onClose={() => setOpen(false)} width={280}>
          <div role="dialog" aria-label="Escolher ícone" style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 2 }}>
              {EMOJIS.map((e) => (
                <button key={e} className="btn btn-fan btn-ico btn-sm" type="button" aria-label={e} onClick={() => pick(e)} style={{ fontSize: "calc(16px * var(--fs, 1))" }}>{e}</button>
              ))}
            </div>
            <form className="row" style={{ gap: 6 }} onSubmit={(ev) => { ev.preventDefault(); if (validIcon(custom)) pick(custom.trim()); }}>
              <input className="inp" aria-label="Outro emoji" placeholder="Colar outro emoji" value={custom} onChange={(ev) => setCustom(ev.target.value)} />
              <button className="btn btn-sec btn-sm" type="submit" disabled={!validIcon(custom)}>Usar</button>
            </form>
            {icon && <button className="btn btn-fan btn-sm" type="button" style={{ alignSelf: "flex-start", color: "var(--danger)" }} onClick={() => pick(null)}>Remover ícone</button>}
          </div>
        </Popover></Presence>
    </>
  );
}
