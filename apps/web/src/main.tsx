import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./pwa";
import { registerServiceWorker } from "./sw-register";
import { applyReduceMotion, loadReduceMotion } from "./theme";
import { applyTextSize, loadTextSize } from "./text-size";
import "./styles/base.css";
import "./styles/telas.css";
import "./styles/captura.css";
import "./styles/editor.css";
import "./styles/tasks.css";
import "./styles/overrides.css";

applyReduceMotion(loadReduceMotion());
applyTextSize(loadTextSize());
registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
