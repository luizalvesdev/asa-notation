export interface SourceFile {
  /** Caminho com "/" (como vem de um .zip ou de uma pasta escolhida). */
  path: string;
  text: string;
}

export interface ImportNode {
  /** Caminho de origem; identifica o nó. */
  key: string;
  parentKey: string | null;
  title: string;
  markdown: string;
  depth: number;
  /** Veio de um arquivo (tem texto) ou é só uma pasta que vira página-pai. */
  isFile: boolean;
}

export interface Skipped {
  path: string;
  reason: string;
}

export interface ImportPlan {
  nodes: ImportNode[];
  skipped: Skipped[];
}

const NOTION_ID = /\s+[0-9a-f]{32}$/i;
const IGNORED_DIRS = new Set(["node_modules", "__macosx"]);
const MARKDOWN = /\.(md|markdown)$/i;

/** Nome limpo: sem extensão e sem o código de 32 letras e números que o Notion põe no fim. */
export function cleanTitle(name: string): string {
  const base = name.replace(MARKDOWN, "").replace(NOTION_ID, "").trim();
  return base === "" ? "Sem título" : base;
}

/** Tira a pasta única que envolve tudo (ex.: "Export-abc/" de um .zip do Notion, "repo-main/" do GitHub). */
function stripWrapper(paths: string[][]): string[][] {
  if (paths.length === 0) return paths;
  const first = paths[0]![0];
  return paths.every((p) => p.length > 1 && p[0] === first) ? paths.map((p) => p.slice(1)) : paths;
}

/** Remove o bloco de propriedades (---) do começo de uma nota do Obsidian. */
export function stripFrontMatter(md: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/.exec(md);
  return match ? md.slice(match[0].length) : md;
}

/** O Notion repete o título como primeiro "# Título"; a página já mostra o título. */
export function stripDuplicateHeading(md: string, title: string): string {
  const match = /^\s*#\s+(.+?)\s*(\r?\n|$)/.exec(md);
  if (match && match[1]!.trim().toLowerCase() === title.trim().toLowerCase()) return md.slice(match[0].length).replace(/^\s*\n/, "");
  return md;
}

const natural = (a: string, b: string) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });

/**
 * Transforma arquivos soltos numa árvore de páginas:
 *  - cada pasta vira uma página-pai (vazia), a menos que exista um `Nome.md` ao lado da pasta `Nome/` (como no Notion);
 *  - títulos saem do nome do arquivo, sem extensão nem código do Notion;
 *  - pastas e arquivos ocultos (.git, .obsidian), CSV e anexos ficam de fora, com o motivo.
 */
export function buildImportPlan(files: readonly SourceFile[]): ImportPlan {
  const skipped: Skipped[] = [];
  const usable: { segments: string[]; text: string; path: string }[] = [];

  for (const file of files) {
    const segments = file.path.replace(/\\/g, "/").replace(/^\.?\//, "").split("/").filter(Boolean);
    if (segments.length === 0) continue;
    if (segments.some((s) => s.startsWith(".") || IGNORED_DIRS.has(s.toLowerCase()))) {
      skipped.push({ path: file.path, reason: "arquivo oculto ou de sistema" });
    } else if (!MARKDOWN.test(segments[segments.length - 1]!)) {
      const ext = /\.([A-Za-z0-9]+)$/.exec(segments[segments.length - 1]!)?.[1]?.toLowerCase();
      skipped.push({ path: file.path, reason: ext === "csv" ? "tabela (CSV) não é importada" : "anexo ou formato sem suporte" });
    } else {
      usable.push({ segments, text: file.text, path: file.path });
    }
  }

  const stripped = stripWrapper(usable.map((u) => u.segments));
  usable.forEach((u, i) => (u.segments = stripped[i]!));
  usable.sort((a, b) => natural(a.segments.join("/"), b.segments.join("/")));

  const nodes = new Map<string, ImportNode>();
  const order: string[] = [];
  const add = (node: ImportNode) => {
    nodes.set(node.key, node);
    order.push(node.key);
  };

  // Primeiro os arquivos, para uma pasta saber se tem um arquivo "irmão" com o mesmo nome.
  const fileByKey = new Map<string, (typeof usable)[number]>();
  for (const u of usable) fileByKey.set(u.segments.join("/"), u);

  const dirKey = (segs: string[]) => segs.join("/");
  /** Chave da página que representa a pasta `segs`: o arquivo irmão (Notion) ou a própria pasta. */
  const pageKeyForDir = (segs: string[]): string => {
    const sibling = [...fileByKey.keys()].find((k) => {
      const parts = k.split("/");
      return parts.length === segs.length && parts.slice(0, -1).join("/") === segs.slice(0, -1).join("/") && cleanTitle(parts[parts.length - 1]!) === cleanTitle(segs[segs.length - 1]!) && cleanTitle(parts[parts.length - 1]!) !== "Sem título";
    });
    return sibling ?? dirKey(segs);
  };

  const ensureDir = (segs: string[]): string => {
    const key = pageKeyForDir(segs);
    if (!nodes.has(key)) {
      const parentKey = segs.length > 1 ? ensureDir(segs.slice(0, -1)) : null;
      // Se for o arquivo irmão, ele mesmo é adicionado depois; aqui só se cria pasta sem arquivo.
      if (!fileByKey.has(key)) add({ key, parentKey, title: cleanTitle(segs[segs.length - 1]!), markdown: "", depth: segs.length - 1, isFile: false });
    }
    return key;
  };

  for (const u of usable) {
    const key = u.segments.join("/");
    const parentKey = u.segments.length > 1 ? ensureDir(u.segments.slice(0, -1)) : null;
    const title = cleanTitle(u.segments[u.segments.length - 1]!);
    const markdown = stripDuplicateHeading(stripFrontMatter(u.text), title);
    // Arquivo irmão de pasta com o mesmo nome fica no lugar certo da ordem (antes dos filhos).
    add({ key, parentKey, title, markdown, depth: u.segments.length - 1, isFile: true });
  }

  // O pai de um filho pode ter sido adicionado depois dele (arquivo irmão): reordena para pai vir antes.
  const placed = new Set<string>();
  const out: ImportNode[] = [];
  const place = (key: string) => {
    if (placed.has(key)) return;
    const node = nodes.get(key)!;
    if (node.parentKey && nodes.has(node.parentKey)) place(node.parentKey);
    placed.add(key);
    out.push(node);
  };
  for (const key of order) place(key);

  // Pai que não existe como nó (pasta cujo irmão foi ignorado) vira raiz.
  for (const node of out) if (node.parentKey && !nodes.has(node.parentKey)) node.parentKey = null;
  return { nodes: out, skipped };
}
