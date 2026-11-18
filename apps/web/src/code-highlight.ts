import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { createLowlight } from "lowlight";

/** Só as linguagens que mais aparecem em anotações: o conjunto completo pesa ~200 KB a mais no pacote. */
export const lowlight = createLowlight({ bash, css, go, java, javascript, json, markdown, python, rust, sql, typescript, xml, yaml });
lowlight.registerAlias({ bash: ["sh", "shell", "zsh"], javascript: ["js", "jsx"], typescript: ["ts", "tsx"], xml: ["html", "svg"], yaml: ["yml"], markdown: ["md"], python: ["py"], rust: ["rs"] });
