import { useRef, useState } from "react";
import { Popover } from "./db-cells";
import { Presence } from "./Presence";

export const COVER_CSS: Record<string, string> = {
  sunrise: "linear-gradient(120deg, #f6d365 0%, #fda085 100%)",
  ocean: "linear-gradient(120deg, #4facfe 0%, #00c6a7 100%)",
  forest: "linear-gradient(120deg, #56ab2f 0%, #a8e063 100%)",
  dusk: "linear-gradient(120deg, #614385 0%, #516395 100%)",
  slate: "linear-gradient(120deg, #485563 0%, #29323c 100%)",
  rose: "linear-gradient(120deg, #ee9ca7 0%, #ffdde1 100%)",
};

/** CSS de fundo para o valor guardado: degradê da lista, imagem http(s) ou nada. */
export function coverBackground(cover: string | null): string | null {
  if (!cover) return null;
  if (cover.startsWith("grad:")) return COVER_CSS[cover.slice(5)] ?? null;
  return /^https?:\/\/\S+$/i.test(cover) ? `center / cover no-repeat url("${cover.replace(/"/g, "%22")}")` : null;
}

export function Cover({ cover, height = 180 }: { cover: string | null; height?: number }) {
  const background = coverBackground(cover);
  if (!background) return null;
  return <div className="cover" role="img" aria-label="Capa da página" style={{ height, background, borderRadius: 12, marginTop: 16 }} />;
}

interface CoverPickerProps {
  cover: string | null;
  onChange: (cover: string | null) => void;
}

export function CoverPicker({ cover, onChange }: CoverPickerProps) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const anchor = useRef<HTMLButtonElement>(null);
  const valid = /^https?:\/\/\S+$/i.test(url.trim()) && url.trim().length <= 300;
  const pick = (value: string | null) => {
    onChange(value);
    setOpen(false);
  };
  return (
    <>
      <button ref={anchor} className="btn btn-fan btn-sm" type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {cover ? "Trocar capa" : "Capa"}
      </button>
      <Presence show={open}><Popover anchor={anchor} onClose={() => setOpen(false)} width={280}>
          <div role="dialog" aria-label="Escolher capa" style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
              {Object.entries(COVER_CSS).map(([name, css]) => (
                <button key={name} className="plain" type="button" aria-label={`Capa ${name}`} onClick={() => pick(`grad:${name}`)} style={{ height: 40, borderRadius: 8, background: css, cursor: "pointer", boxShadow: cover === `grad:${name}` ? "0 0 0 2px var(--accent)" : "none" }} />
              ))}
            </div>
            <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (valid) pick(url.trim()); }}>
              <input className="inp" aria-label="Endereço de uma imagem" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
              <button className="btn btn-sec btn-sm" type="submit" disabled={!valid}>Usar</button>
            </form>
            {cover && <button className="btn btn-fan btn-sm" type="button" style={{ alignSelf: "flex-start", color: "var(--danger)" }} onClick={() => pick(null)}>Remover capa</button>}
          </div>
        </Popover></Presence>
    </>
  );
}
