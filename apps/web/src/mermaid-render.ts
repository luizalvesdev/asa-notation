type Mermaid = typeof import("mermaid").default;

let loading: Promise<Mermaid> | null = null;
let counter = 0;
let currentTheme: "default" | "dark" | null = null;

/** Carrega o Mermaid só quando um diagrama aparece (a biblioteca é grande). */
async function mermaid(theme: "default" | "dark"): Promise<Mermaid> {
  loading ??= import("mermaid").then((m) => m.default);
  const lib = await loading;
  if (currentTheme !== theme) {
    // "strict": o Mermaid limpa o SVG e não deixa o diagrama executar script nem abrir links perigosos.
    lib.initialize({ startOnLoad: false, securityLevel: "strict", theme, fontFamily: "inherit" });
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
