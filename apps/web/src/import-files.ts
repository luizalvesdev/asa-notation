import { strFromU8, unzipSync } from "fflate";
import type { SourceFile } from "./import-parse";

export const MAX_ZIP_BYTES = 100 * 1024 * 1024;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_FILES = 5000;

const isMarkdown = (name: string) => /\.(md|markdown)$/i.test(name);

export interface Selection {
  files: SourceFile[];
  /** Problemas que não impedem o resto (zip grande demais, arquivo ilegível). */
  warnings: string[];
}

/** Lê o que a pessoa escolheu: um ou mais .zip, uma pasta ou arquivos .md soltos. Só o texto dos .md é lido. */
export async function readSelection(selected: readonly File[]): Promise<Selection> {
  const files: SourceFile[] = [];
  const warnings: string[] = [];

  for (const file of selected) {
    if (files.length >= MAX_FILES) {
      warnings.push(`Passou de ${MAX_FILES} arquivos: o restante foi ignorado.`);
      break;
    }
    if (/\.zip$/i.test(file.name)) {
      if (file.size > MAX_ZIP_BYTES) {
        warnings.push(`${file.name}: maior que ${MAX_ZIP_BYTES / 1024 / 1024} MB, não foi lido.`);
        continue;
      }
      try {
        const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
          // Só descompacta os .md pequenos; o resto entra na lista de ignorados sem custo.
          filter: (entry) => !entry.name.endsWith("/") && (!isMarkdown(entry.name) || entry.originalSize <= MAX_FILE_BYTES),
        });
        for (const [path, data] of Object.entries(entries)) files.push({ path, text: isMarkdown(path) ? strFromU8(data) : "" });
      } catch {
        warnings.push(`${file.name}: não foi possível abrir o .zip.`);
      }
      continue;
    }
    const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    if (isMarkdown(path) && file.size > MAX_FILE_BYTES) {
      warnings.push(`${path}: maior que ${MAX_FILE_BYTES / 1024 / 1024} MB, foi ignorado.`);
      continue;
    }
    files.push({ path, text: isMarkdown(path) ? await file.text() : "" });
  }
  return { files, warnings };
}
