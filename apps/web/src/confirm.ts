/**
 * Confirmação antes de excluir: `if (await askConfirm({ title: "Excluir a tarefa?" })) apagar()`.
 * Um único modal (ConfirmHost, no Shell) atende o app todo. Sem host montado, confirma (testes e telas soltas).
 */
export interface ConfirmOptions {
  title: string;
  body?: string;
  /** Texto do botão de confirmar. Padrão: "Excluir". */
  confirmLabel?: string;
}

export interface ConfirmRequest extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

let host: ((req: ConfirmRequest) => void) | null = null;

export function setConfirmHost(fn: ((req: ConfirmRequest) => void) | null): void {
  host = fn;
}

export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  if (!host) return Promise.resolve(true);
  const show = host;
  return new Promise((resolve) => show({ ...options, resolve }));
}
