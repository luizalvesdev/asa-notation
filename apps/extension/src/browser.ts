/** O pedaço da API de extensões do Firefox (`browser.*`, com promessas) que a extensão usa. */

interface Tab {
  id?: number;
  url?: string;
  title?: string;
}

interface Browser {
  tabs: { query(q: { active: boolean; currentWindow: boolean }): Promise<Tab[]>; create(p: { url: string }): Promise<Tab> };
  scripting: {
    executeScript(p: { target: { tabId: number }; files: string[] }): Promise<{ result?: unknown }[]>;
    executeScript(p: { target: { tabId: number }; func: () => unknown }): Promise<{ result?: unknown }[]>;
    executeScript(p: { target: { tabId: number }; func: (arg: string) => unknown; args: [string] }): Promise<{ result?: unknown }[]>;
  };
  storage: { local: { get(keys: string[]): Promise<Record<string, unknown>>; set(items: Record<string, unknown>): Promise<void> } };
  runtime: { openOptionsPage(): Promise<void> };
  permissions: { request(p: { origins: string[] }): Promise<boolean>; contains(p: { origins: string[] }): Promise<boolean> };
}

declare const browser: Browser;
export const ext = (): Browser => browser;

import { DEFAULT_SERVER, type Config } from "./api.js";

export async function loadConfig(): Promise<Config | null> {
  const { server, token } = await ext().storage.local.get(["server", "token"]);
  if (typeof token !== "string" || token === "") return null;
  return { server: typeof server === "string" && server ? server : DEFAULT_SERVER, token };
}
