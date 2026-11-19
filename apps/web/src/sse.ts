/** Lê um fluxo `text/event-stream` em pedaços de texto e devolve os objetos JSON de cada `data:`. Linhas partidas entre pedaços são juntadas. */
export class SseParser {
  private buffer = "";

  push(chunk: string): unknown[] {
    this.buffer = (this.buffer + chunk).replace(/\r\n/g, "\n");
    const out: unknown[] = [];
    let at: number;
    while ((at = this.buffer.indexOf("\n\n")) >= 0) {
      const event = parseBlock(this.buffer.slice(0, at));
      this.buffer = this.buffer.slice(at + 2);
      if (event !== undefined) out.push(event);
    }
    return out;
  }

  /** Evento que ficou sem a linha em branco final (o servidor fechou a conexão). */
  flush(): unknown[] {
    const rest = this.buffer.trim();
    this.buffer = "";
    const event = rest === "" ? undefined : parseBlock(rest);
    return event === undefined ? [] : [event];
  }
}

function parseBlock(block: string): unknown {
  const data = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (data === "") return undefined;
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}
