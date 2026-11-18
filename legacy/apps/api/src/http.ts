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
}
