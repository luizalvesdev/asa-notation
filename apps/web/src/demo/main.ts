// Entrada da demo: sobe a API local antes de abrir o app.
import { bootDemo, resetDemo } from "./server";

try {
  await bootDemo();
} catch (err) {
  console.error(err);
  const root = document.getElementById("root");
  if (root) root.textContent = "Não foi possível abrir a demo neste navegador. Tente o Chrome, o Edge ou o Firefox atualizados.";
  throw err;
}
// Quem chega pelo link cai na página de boas-vindas, que explica a demo.
if (location.hash === "" || location.hash === "#" || location.hash === "#/") {
  const res = await fetch("/api/pages/tree");
  const { pages } = (await res.json()) as { pages: { id: string; title: string }[] };
  const welcome = pages.find((p) => p.title === "Bem-vindo à demo");
  if (welcome) history.replaceState(null, "", `#/p/${welcome.id}`);
}
(window as unknown as { __asaDemoReset?: () => void }).__asaDemoReset = () => void resetDemo();
await import("../main");
