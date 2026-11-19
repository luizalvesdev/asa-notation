import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { CODE_LANGUAGES, languageLabel, languageValue } from "./code-languages";

/** Bloco de código com seletor de linguagem (no modo leitura, só o nome). O destaque continua sendo do lowlight. */
export function CodeBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const language = node.attrs.language;
  const value = languageValue(language);
  const editable = editor.isEditable;
  const label = languageLabel(language);

  return (
    <NodeViewWrapper className="code-block">
      {(editable || label) && (
        <div className="code-bar" contentEditable={false}>
          {editable ? (
            <select
              className="code-lang"
              aria-label="Linguagem do código"
              value={value}
              onChange={(e) => updateAttributes({ language: e.target.value === "" ? null : e.target.value })}
            >
              <option value="">Automático</option>
              {CODE_LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
              {/* Linguagem que veio de fora e não está na lista: mantém o valor sem perder */}
              {value === "" && typeof language === "string" && language.trim() !== "" && <option value={language}>{language}</option>}
            </select>
          ) : (
            <span className="code-lang-ro">{label}</span>
          )}
        </div>
      )}
      <pre>
        <NodeViewContent<"code"> as="code" className={value ? `language-${value}` : undefined} />
      </pre>
    </NodeViewWrapper>
  );
}
