/** Entrega um arquivo para o navegador salvar. */
export function downloadFile(name: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Dá tempo ao navegador de iniciar o download antes de liberar o objeto.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
