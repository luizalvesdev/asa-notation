import { DEFAULT_SERVER, createApi, errorMessage, normalizeServer } from "./api.js";
import { ext, loadConfig } from "./browser.js";

const server = document.getElementById("server") as HTMLInputElement;
const token = document.getElementById("token") as HTMLInputElement;
const status = document.getElementById("status")!;

const say = (text: string, kind: "ok" | "error" | "" = "") => {
  status.textContent = text;
  status.className = kind;
};

void loadConfig().then((c) => {
  server.value = c?.server ?? DEFAULT_SERVER;
  token.value = c?.token ?? "";
});

(document.getElementById("form") as HTMLFormElement).onsubmit = (ev) => {
  ev.preventDefault();
  const origin = normalizeServer(server.value);
  if (!origin) return say("Endereço inválido: use https:// (ou http://localhost para testes).", "error");
  const secret = token.value.trim();
  // O pedido de permissão precisa sair direto do clique, antes de qualquer espera.
  const granted = ext().permissions.request({ origins: [`${origin}/*`] });
  void (async () => {
    if (!(await granted)) return say("Sem permissão para acessar esse endereço.", "error");
    say("Testando…");
    try {
      await createApi({ server: origin, token: secret }).tree();
      await ext().storage.local.set({ server: origin, token: secret });
      server.value = origin;
      say("Conectado. Já pode usar o botão da extensão.", "ok");
    } catch (err) {
      say(errorMessage(err), "error");
    }
  })();
};
