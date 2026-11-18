type Shape = string | [cx: number, cy: number, r: number];

const ICONS = {
  search: [[11, 11, 7], "M20 20l-4-4"],
  today: [[12, 12, 4], "M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"],
  week: ["M4 6h16v14H4z", "M4 10h16M8 3v4M16 3v4"],
  inbox: ["M3 13h5l1.5 3h5l1.5-3h5", "M5 5h14l2 8v6H3v-6z"],
  study: ["M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z", "M4 19V5"],
  target: [[12, 12, 8], [12, 12, 4], [12, 12, 0.5]],
  clock: [[12, 12, 8], "M12 8v4l3 2"],
  chart: ["M4 20V10M10 20V4M16 20v-7M22 20H2"],
  bell: ["M6 16v-5a6 6 0 1 1 12 0v5l2 2H4z", "M10 21h4"],
  trash: ["M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"],
  settings: ["M4 6h9M17 6h3M15 4v4M4 12h3M11 12h9M9 10v4M4 18h11M19 18h1M17 16v4"],
  plus: ["M12 5v14M5 12h14"],
  panel: ["M4 5h16v14H4z", "M9 5v14"],
  menu: ["M4 6h16M4 12h16M4 18h16"],
  feather: ["M3 18c6 0 11-3.5 14-11 1.6 4.2.6 8.6-2.6 11.6", "M7.5 19.5c3.6-.6 6.6-2.6 8.6-6"],
  check: ["M5 12.5l4.5 4.5L19 7"],
} satisfies Record<string, Shape[]>;

export type IconName = keyof typeof ICONS;

export function isIconName(name: string): name is IconName {
  return name in ICONS;
}

interface IconProps {
  name: IconName;
  large?: boolean;
  className?: string;
}

export function Icon({ name, large, className }: IconProps) {
  const shapes: Shape[] = ICONS[name];
  return (
    <svg className={["ico", large ? "lg" : "", className ?? ""].filter(Boolean).join(" ")} viewBox="0 0 24 24" aria-hidden="true">
      {shapes.map((shape, i) =>
        typeof shape === "string" ? <path key={i} d={shape} /> : <circle key={i} cx={shape[0]} cy={shape[1]} r={shape[2]} />,
      )}
    </svg>
  );
}

export function ThemeIcon() {
  return (
    <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" />
    </svg>
  );
}
