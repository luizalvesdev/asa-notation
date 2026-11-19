import type { Editor } from "@tiptap/react";

type ViewLike = Editor["view"];

/**
 * Muda classes/estilos nos elementos do editor sem ele reagir: o ProseMirror observa o próprio DOM e,
 * ao ver um atributo mudar num bloco, redesenha o bloco (o que apagava o destaque e perdia a alça).
 * Usa o mesmo recurso que ele usa nas próprias mudanças.
 */
export function quietly(view: ViewLike, change: () => void): void {
  const observer = (view as unknown as { domObserver?: { stop(): void; start(): void } }).domObserver;
  observer?.stop();
  try {
    change();
  } finally {
    observer?.start();
  }
}

/**
 * Arrastar blocos da página como numa lista reordenável: o bloco segue o mouse e os vizinhos
 * abrem espaço com animação (o de baixo sobe, o de cima desce). Ao soltar, o bloco é movido no documento.
 * Vale para os blocos do nível de cima da página; os de dentro (itens de lista etc.) usam o arrastar nativo.
 */

/** Para onde o bloco vai, pela posição do seu centro em relação aos centros dos outros (medidos no início). */
export function targetIndex(centers: readonly number[], from: number, draggedCenter: number): number {
  let index = from;
  for (let k = from + 1; k < centers.length; k++) if (draggedCenter > centers[k]!) index = k;
  for (let k = from - 1; k >= 0; k--) if (draggedCenter < centers[k]!) index = k;
  return index;
}

/** Deslocamento de cada bloco para abrir espaço: entre a origem e o destino, todos andam o tamanho do bloco arrastado. */
export function shiftFor(k: number, from: number, to: number, gap: number): number {
  if (to > from && k > from && k <= to) return -gap;
  if (to < from && k >= to && k < from) return gap;
  return 0;
}

const MOVE = "transform var(--medio) var(--padrao)";

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/** Começa a arrastar o bloco do nível de cima de índice `from`. Devolve false se não dá (aí fica o arrastar nativo). */
export function startBlockSort(editor: Editor, from: number, start: PointerEvent): boolean {
  const view = editor.view;
  const doc = view.state.doc;
  if (from < 0 || from >= doc.childCount || doc.childCount < 2) return false;

  const positions: number[] = [];
  let pos = 0;
  doc.forEach((node) => {
    positions.push(pos);
    pos += node.nodeSize;
  });
  const els = positions.map((p) => view.nodeDOM(p)).map((n) => (n instanceof HTMLElement ? n : null));
  if (els.some((e) => e === null)) return false;
  const blocks = els as HTMLElement[];

  const scroller = scrollParent(view.dom);
  const scroll0 = scroller?.scrollTop ?? 0;
  const rects = blocks.map((b) => b.getBoundingClientRect());
  const centers = rects.map((r) => r.top + r.height / 2);
  const dragged = blocks[from]!;
  const next = rects[from + 1] ?? rects[from - 1]!;
  // Tamanho do bloco mais o espaço até o vizinho.
  const gap = rects[from]!.height + Math.max(0, from + 1 < rects.length ? next.top - rects[from]!.bottom : rects[from]!.top - next.bottom);

  document.body.classList.add("block-sorting");
  quietly(view, () => {
    dragged.classList.add("block-dragging");
    for (const [k, b] of blocks.entries()) if (k !== from) b.style.transition = MOVE;
  });

  let to = from;
  let lastY = start.clientY;
  let frame = 0;

  const layout = () => {
    const scrolled = (scroller?.scrollTop ?? 0) - scroll0;
    const dy = lastY - start.clientY + scrolled;
    to = targetIndex(centers, from, centers[from]! + dy);
    quietly(view, () => {
      dragged.style.transform = `translateY(${dy}px)`;
      for (const [k, b] of blocks.entries()) if (k !== from) b.style.transform = `translateY(${shiftFor(k, from, to, gap)}px)`;
    });
  };

  // Rola a página sozinho quando o mouse chega perto da borda.
  const autoscroll = () => {
    if (scroller) {
      const box = scroller.getBoundingClientRect();
      const edge = 60;
      const speed = lastY < box.top + edge ? -(box.top + edge - lastY) / 4 : lastY > box.bottom - edge ? (lastY - (box.bottom - edge)) / 4 : 0;
      if (speed !== 0) {
        scroller.scrollTop += speed;
        layout();
      }
    }
    frame = requestAnimationFrame(autoscroll);
  };
  frame = requestAnimationFrame(autoscroll);

  const move = (e: PointerEvent) => {
    lastY = e.clientY;
    layout();
  };

  const finish = (commit: boolean) => {
    cancelAnimationFrame(frame);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("keydown", key, true);
    document.body.classList.remove("block-sorting");
    quietly(view, () => {
      dragged.classList.remove("block-dragging");
      for (const b of blocks) {
        b.style.transition = "";
        b.style.transform = "";
        if (!b.getAttribute("style")) b.removeAttribute("style");
      }
    });
    if (!commit || to === from) return;
    const node = doc.child(from);
    const tr = view.state.tr.delete(positions[from]!, positions[from]! + node.nodeSize);
    // Destino no documento já sem o bloco: depois do bloco `to` (descendo) ou antes dele (subindo).
    const insertAt = to > from ? positions[to]! + doc.child(to).nodeSize - node.nodeSize : positions[to]!;
    tr.insert(insertAt, node);
    view.dispatch(tr.scrollIntoView());
    view.focus();
  };
  const up = () => finish(true);
  const cancel = () => finish(false);
  const key = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      finish(false);
    }
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("keydown", key, true);
  return true;
}
