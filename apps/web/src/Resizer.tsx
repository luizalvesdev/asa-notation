import { useRef, useState } from "react";
import { clampWidth, draggedWidth, type SizeLimits } from "./panel-size";

interface Props {
  /** Lado da janela em que o painel redimensionado fica. */
  edge: "left" | "right";
  width: number;
  limits: SizeLimits;
  label: string;
  /** Maior largura que cabe agora (a janela pode ser menor que o limite do painel). */
  ceiling?: number;
  onChange: (width: number) => void;
  onDragging?: (dragging: boolean) => void;
}

/** Alça para arrastar a borda de um painel. Setas mudam 16 px (Shift: 48), Home/End vão aos limites, duplo clique volta ao padrão. */
export function Resizer({ edge, width, limits, label, ceiling, onChange, onDragging }: Props) {
  const start = useRef<{ x: number; width: number } | null>(null);
  const [active, setActive] = useState(false);
  const set = (value: number) => onChange(clampWidth(value, limits, ceiling));

  const stop = () => {
    if (!start.current) return;
    start.current = null;
    setActive(false);
    onDragging?.(false);
  };

  return (
    <div className={`rz rz-${edge}`}>
      <span
        className={`rz-h${active ? " on" : ""}`}
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        aria-valuenow={width}
        aria-valuemin={limits.min}
        aria-valuemax={Math.min(limits.max, ceiling ?? Infinity)}
        tabIndex={0}
        title="Arraste para mudar a largura · duplo clique restaura"
        onMouseDown={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          start.current = { x: e.clientX, width };
          e.currentTarget.setPointerCapture(e.pointerId);
          setActive(true);
          onDragging?.(true);
        }}
        onPointerMove={(e) => {
          const from = start.current;
          if (from) set(draggedWidth(from.width, e.clientX - from.x, edge));
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onLostPointerCapture={stop}
        onDoubleClick={() => set(limits.initial)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 48 : 16;
          // Seta para o lado em que o painel cresce aumenta a largura.
          const grow = edge === "left" ? "ArrowRight" : "ArrowLeft";
          const shrink = edge === "left" ? "ArrowLeft" : "ArrowRight";
          if (e.key === grow) set(width + step);
          else if (e.key === shrink) set(width - step);
          else if (e.key === "Home") set(limits.min);
          else if (e.key === "End") set(limits.max);
          else if (e.key === "Enter") set(limits.initial);
          else return;
          e.preventDefault();
        }}
      />
    </div>
  );
}
