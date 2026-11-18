import { arrowHead } from "./canvas-logic";
import { COLOR_CSS, type Shape } from "./canvas-types";

/** Uma forma do quadro como elemento SVG. Serve para o editor e para a leitura. */
export function ShapeEl({ shape: s }: { shape: Shape }) {
  const stroke = COLOR_CSS[s.color];
  const common = { stroke, strokeWidth: s.stroke, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;
  switch (s.type) {
    case "rect":
      return <rect {...common} x={Math.min(s.x, s.x + s.w)} y={Math.min(s.y, s.y + s.h)} width={Math.abs(s.w)} height={Math.abs(s.h)} rx={4} />;
    case "ellipse":
      return <ellipse {...common} cx={s.x + s.w / 2} cy={s.y + s.h / 2} rx={Math.abs(s.w) / 2} ry={Math.abs(s.h) / 2} />;
    case "line":
      return <line {...common} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />;
    case "arrow": {
      const [ax, ay, bx, by] = arrowHead(s.x1, s.y1, s.x2, s.y2, 10 + s.stroke * 2);
      return (
        <g {...common}>
          <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
          <polyline points={`${ax},${ay} ${s.x2},${s.y2} ${bx},${by}`} />
        </g>
      );
    }
    case "pen": {
      if (s.points.length === 2) return <circle cx={s.points[0]} cy={s.points[1]} r={s.stroke / 2} fill={stroke} />;
      const points = s.points.reduce<string[]>((acc, v, i) => (i % 2 === 0 ? [...acc, `${v},${s.points[i + 1]}`] : acc), []).join(" ");
      return <polyline {...common} points={points} />;
    }
    case "text":
      return (
        <text x={s.x} y={s.y} fill={stroke} fontSize={s.size} fontFamily="var(--sans)" dominantBaseline="hanging" style={{ whiteSpace: "pre", userSelect: "none" }}>
          {s.text.split("\n").map((line, i) => (
            <tspan key={i} x={s.x} dy={i === 0 ? 0 : s.size * 1.3}>
              {line}
            </tspan>
          ))}
        </text>
      );
  }
}

export function ShapesSvg({ shapes }: { shapes: readonly Shape[] }) {
  return (
    <>
      {shapes.map((s) => (
        <ShapeEl key={s.id} shape={s} />
      ))}
    </>
  );
}
