import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./pwa";
import { applyReduceMotion, loadReduceMotion } from "./theme";
import "./styles/base.css";
import "./styles/telas.css";
import "./styles/captura.css";
import "./styles/editor.css";
import "./styles/tasks.css";
import "./styles/overrides.css";

applyReduceMotion(loadReduceMotion());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
