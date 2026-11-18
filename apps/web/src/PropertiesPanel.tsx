import { useEffect, useState } from "react";
import { PropEditor } from "./db-cells";
import type { PropValue, Schema } from "./db-types";
import { TYPE_LABEL } from "./db-types";

interface PropertiesPanelProps {
  schema: Schema;
  values: Record<string, PropValue>;
  /** Recebe todos os valores atuais depois de uma mudança (o servidor junta com o que já existe). */
  onChange: (values: Record<string, PropValue>) => void;
}

/** Propriedades de uma linha, no topo da página dela. */
export function PropertiesPanel({ schema, values, onChange }: PropertiesPanelProps) {
  const [local, setLocal] = useState(values);
  useEffect(() => setLocal(values), [values]);

  if (schema.properties.length === 0) return null;
  return (
    <div className="props" style={{ margin: "12px 0 16px" }} aria-label="Propriedades">
      {schema.properties.map((prop) => (
        <div key={prop.id} style={{ display: "contents" }}>
          <span className="pk">{prop.name}</span>
          <div className="pv" style={{ padding: 0, minWidth: 0 }} title={TYPE_LABEL[prop.type]}>
            <PropEditor
              prop={prop}
              value={local[prop.id]}
              onChange={(value) => {
                const next = { ...local, [prop.id]: value };
                setLocal(next);
                onChange(Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)) as Record<string, PropValue>);
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
