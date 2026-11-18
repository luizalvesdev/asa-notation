/** Largura e altura de um SVG, lidas do viewBox (ou de width/height). Null se não achar. */
export function svgSize(svg: string): { width: number; height: number } | null {
  const vb = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/i.exec(svg);
  if (vb) return { width: Number(vb[1]), height: Number(vb[2]) };
  const w = /<svg[^>]*\swidth="([\d.]+)(?:px)?"/i.exec(svg);
  const h = /<svg[^>]*\sheight="([\d.]+)(?:px)?"/i.exec(svg);
  return w && h ? { width: Number(w[1]), height: Number(h[1]) } : null;
}

/** SVG pronto para salvar: declara o espaço de nomes (o Mermaid embute o SVG numa página, sem ele) e o tamanho. */
export function standaloneSvg(svg: string): string {
  const size = svgSize(svg);
  let out = svg.includes("xmlns=") ? svg : svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  if (size && !/<svg[^>]*\swidth=/i.test(out)) out = out.replace("<svg", `<svg width="${size.width}" height="${size.height}"`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${out}`;
}

/** Desenha o SVG num canvas (fundo sólido) e devolve o PNG. Escala 2 para ficar nítido. */
export async function svgToPng(svg: string, background: string, scale = 2): Promise<Blob> {
  const size = svgSize(svg);
  if (!size) throw new Error("tamanho do SVG desconhecido");
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(standaloneSvg(svg))}`;
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("não foi possível ler o SVG"));
    image.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(size.width * scale);
  canvas.height = Math.ceil(size.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponível");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("falha ao gerar o PNG"))), "image/png"));
}
