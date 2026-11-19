import { extract } from "./extract.js";

// Injetado na aba pelo popup. Fica guardado no mundo isolado da extensão; o popup chama em seguida.
(window as unknown as { __asaExtract: () => unknown }).__asaExtract = () => extract(window);
