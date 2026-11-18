export type Row = Record<string, unknown>;

export interface SqlClient {
  query(text: string, params?: unknown[]): Promise<Row[]>;
}
