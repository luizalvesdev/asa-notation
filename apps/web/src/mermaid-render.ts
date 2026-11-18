type Mermaid = typeof import("mermaid").default;

let loading: Promise<Mermaid> | null = null;
let counter = 0;
let currentTheme: "default" | "dark" | null = null;

/** Cores do app (mesmos tokens do design) para o diagrama não parecer um corpo estranho na página. */
const PALETTES = {
  default: { bg: "#FFFFFF", text: "#1A1A17", line: "#706E66", primary: "#E9ECFB", primaryBorder: "#2F4AD0", secondary: "#E0F0EC", secondaryBorder: "#0E6B5E", tertiary: "#FBEEDD", tertiaryBorder: "#A14D06", note: "#F4EFFE", noteBorder: "#C9B5F5", cat: ["#2F4AD0", "#0E6B5E", "#A14D06", "#6B2BD9", "#B42318", "#1F7A3A"] },
  dark: { bg: "#1A1A18", text: "#ECEAE4", line: "#8A887F", primary: "#1E2340", primaryBorder: "#8EA1FF", secondary: "#13261F", secondaryBorder: "#5FC9B5", tertiary: "#2B2015", tertiaryBorder: "#F0A75E", note: "#1D1730", noteBorder: "#4A3A78", cat: ["#8EA1FF", "#5FC9B5", "#F0A75E", "#C4B0FF", "#FF8A7A", "#6FD08C"] },
} as const;

const FONT = "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";

function themeVariables(theme: "default" | "dark") {
  const c = PALETTES[theme];
  const label = theme === "dark" ? "#0D1030" : "#FFFFFF";
  // Mapa mental: cada ramo numa cor do app; a raiz (git0) em azul de destaque e a barrinha de cada nó (Inv/Peer) na cor do ramo.
  const cScale = Object.fromEntries(
    c.cat.flatMap((color, i) => [[`cScale${i}`, color], [`cScaleInv${i}`, color], [`cScalePeer${i}`, color], [`cScaleLabel${i}`, label], [`git${i}`, color], [`gitBranchLabel${i}`, label]]),
  );
  return {
    fontFamily: FONT,
    fontSize: "14px",
    background: c.bg,
    primaryColor: c.primary,
    primaryBorderColor: c.primaryBorder,
    primaryTextColor: c.text,
    secondaryColor: c.secondary,
    secondaryBorderColor: c.secondaryBorder,
    secondaryTextColor: c.text,
    tertiaryColor: c.tertiary,
    tertiaryBorderColor: c.tertiaryBorder,
    tertiaryTextColor: c.text,
    lineColor: c.line,
    textColor: c.text,
    mainBkg: c.primary,
    nodeBorder: c.primaryBorder,
    clusterBkg: c.tertiary,
    clusterBorder: c.tertiaryBorder,
    edgeLabelBackground: c.bg,
    noteBkgColor: c.note,
    noteBorderColor: c.noteBorder,
    noteTextColor: c.text,
    ...cScale,
  };
}

/** Carrega o Mermaid só quando um diagrama aparece (a biblioteca é grande). */
async function mermaid(theme: "default" | "dark"): Promise<Mermaid> {
  loading ??= import("mermaid").then((m) => m.default);
  const lib = await loading;
  // O Mermaid mede o texto para dimensionar as caixas: com a fonte ainda carregando, a medida sai errada e os rótulos ficam cortados.
  await document.fonts?.ready.catch(() => undefined);
  if (currentTheme !== theme) {
    // "strict": o Mermaid limpa o SVG e não deixa o diagrama executar script nem abrir links perigosos.
    lib.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      themeVariables: themeVariables(theme),
      fontFamily: FONT,
      flowchart: { curve: "basis", padding: 14, htmlLabels: true },
      mindmap: { padding: 16, maxNodeWidth: 220 },
      sequence: { actorMargin: 60, mirrorActors: false },
    });
    currentTheme = theme;
  }
  return lib;
}

export const DEFAULT_DIAGRAM = "flowchart TD\n  A[Início] --> B{Decisão}\n  B -->|Sim| C[Feito]\n  B -->|Não| D[Revisar]\n  D --> B";

/** Desenha o diagrama. Lança com a mensagem do Mermaid se o código estiver errado. */
export async function renderDiagram(code: string, dark: boolean): Promise<string> {
  const lib = await mermaid(dark ? "dark" : "default");
  const id = `mmd-${++counter}`;
  try {
    const { svg } = await lib.render(id, code);
    return svg;
  } finally {
    // Em caso de erro o Mermaid deixa um elemento de erro solto no body.
    document.getElementById(`d${id}`)?.remove();
  }
}
