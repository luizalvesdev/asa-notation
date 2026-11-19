export interface ApiRequest {
  method: string;
  path: string;
  query: Record<string, string | undefined>;
  headers?: Record<string, string | undefined>;
  cookies?: Record<string, string>;
  body?: unknown;
}

export interface ApiResponse {
  status: number;
  body: unknown;
  cookies?: string[];
  /**
   * Resposta em fluxo (SSE): cada item vira um `data:` na ordem em que chega. O servidor de desenvolvimento envia aos poucos;
   * onde o API Gateway segura a resposta (produção hoje), os eventos saem juntos no fim, o que continua funcionando.
   */
  stream?: AsyncIterable<unknown>;
}

/** Texto de um evento SSE. */
export const sseEvent = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`;
