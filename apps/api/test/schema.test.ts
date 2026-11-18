import { describe, expect, it } from "vitest";
import { defaultSchema, parseProps, parseSchema, type Schema } from "../src/databases/schema.js";

const base = (): Schema => defaultSchema();
const raw = (patch: (s: Schema) => void) => {
  const s = JSON.parse(JSON.stringify(base())) as Schema;
  patch(s);
  return s;
};
const UUID = "11111111-1111-4111-8111-111111111111";

describe("parseSchema", () => {
  it("aceita o esquema padrão", () => {
    expect(parseSchema(base())).toEqual(base());
  });

  it("completa o que falta (listas vazias, grupos nulos)", () => {
    const out = parseSchema({ properties: [{ id: "nota", name: " Nota ", type: "number" }], views: [{ id: "v1", name: "Tabela", type: "table" }] }) as Schema;
    expect(out.properties[0]).toEqual({ id: "nota", name: "Nota", type: "number", options: [], relationDb: null });
    expect(out.views[0]).toMatchObject({ filters: [], sorts: [], groupBy: null, dateProp: null, hidden: [] });
  });

  it("exige ao menos uma view", () => {
    expect(parseSchema({ properties: [], views: [] })).toBe("invalid_schema");
    expect(parseSchema(null)).toBe("invalid_schema");
  });

  it("recusa propriedade inválida, repetida ou com id reservado", () => {
    expect(parseSchema(raw((s) => (s.properties[0]!.id = "title")))).toBe("invalid_property_id");
    expect(parseSchema(raw((s) => (s.properties[0]!.id = "A B")))).toBe("invalid_property_id");
    expect(parseSchema(raw((s) => (s.properties[1]!.id = s.properties[0]!.id)))).toBe("duplicate_property");
    expect(parseSchema(raw((s) => (s.properties[0]!.name = "  ")))).toBe("invalid_property_name");
    expect(parseSchema(raw((s) => ((s.properties[0] as { type: string }).type = "formula")))).toBe("invalid_property_type");
  });

  it("opções: só em select, multiselect e status, sem repetir, status com etapa", () => {
    expect(parseSchema(raw((s) => (s.properties[1]!.options = [{ id: "a", name: "A", color: null, group: null }])))).toBe("invalid_options");
    expect(parseSchema(raw((s) => s.properties[0]!.options.push({ ...s.properties[0]!.options[0]! })))).toBe("duplicate_option");
    expect(parseSchema(raw((s) => (s.properties[0]!.options[0]!.group = null)))).toBe("invalid_options");
    expect(parseSchema(raw((s) => ((s.properties[0]!.options[0] as { color: string }).color = "#ff0000")))).toBe("invalid_options");
  });

  it("relação exige a database de destino", () => {
    const rel = (relationDb: unknown) => parseSchema({ properties: [{ id: "livros", name: "Livros", type: "relation", relationDb }], views: [{ id: "v", name: "T", type: "table" }] });
    expect(rel(UUID)).toMatchObject({ properties: [{ relationDb: UUID }] });
    expect(rel("x")).toBe("invalid_relation");
    expect(rel(undefined)).toBe("invalid_relation");
  });

  it("views: filtros, ordenações, agrupamento e data só com propriedades que existem e do tipo certo", () => {
    const ok = (patch: (v: Schema["views"][number]) => void) => parseSchema(raw((s) => patch(s.views[1]!)));
    expect(ok((v) => (v.filters = [{ prop: "status", op: "equals", value: "done" }]))).not.toBeTypeOf("string");
    expect(ok((v) => (v.filters = [{ prop: "nada", op: "equals", value: "x" }]))).toBe("invalid_filters");
    expect(ok((v) => (v.filters = [{ prop: "title", op: "weird" as never, value: "x" }]))).toBe("invalid_filters");
    expect(ok((v) => (v.sorts = [{ prop: "created", dir: "desc" }]))).not.toBeTypeOf("string");
    expect(ok((v) => (v.sorts = [{ prop: "nada", dir: "asc" }]))).toBe("invalid_sorts");
    expect(ok((v) => (v.groupBy = "data"))).toBe("invalid_group_by");
    expect(ok((v) => (v.groupBy = null))).not.toBeTypeOf("string");
    expect(ok((v) => (v.dateProp = "status"))).toBe("invalid_date_prop");
    expect(ok((v) => (v.dateProp = "data"))).not.toBeTypeOf("string");
    expect(ok((v) => (v.hidden = ["nada"]))).toBe("invalid_hidden");
  });

  it("views com id repetido", () => {
    expect(parseSchema(raw((s) => (s.views[1]!.id = s.views[0]!.id)))).toBe("duplicate_view");
  });
});

describe("parseProps", () => {
  const schema: Schema = {
    properties: [
      { id: "nome", name: "Nome", type: "text", options: [], relationDb: null },
      { id: "nota", name: "Nota", type: "number", options: [], relationDb: null },
      { id: "lido", name: "Lido", type: "checkbox", options: [], relationDb: null },
      { id: "quando", name: "Quando", type: "date", options: [], relationDb: null },
      { id: "site", name: "Site", type: "url", options: [], relationDb: null },
      { id: "genero", name: "Gênero", type: "select", options: [{ id: "a", name: "A", color: null, group: null }], relationDb: null },
      { id: "tags", name: "Tags", type: "multiselect", options: [{ id: "x", name: "X", color: null, group: null }, { id: "y", name: "Y", color: null, group: null }], relationDb: null },
      { id: "rel", name: "Rel", type: "relation", options: [], relationDb: UUID },
    ],
    views: [],
  };

  it("aceita um valor válido de cada tipo", () => {
    const props = { nome: "Oi", nota: 4.5, lido: true, quando: "2026-11-18", site: "https://x.dev", genero: "a", tags: ["x", "y"], rel: [UUID] };
    expect(parseProps(schema, props)).toEqual(props);
  });

  it("null apaga", () => {
    expect(parseProps(schema, { nome: null, tags: null })).toEqual({ nome: null, tags: null });
  });

  it("recusa propriedade desconhecida e tipos errados", () => {
    expect(parseProps(schema, { nada: 1 })).toBe("unknown_property");
    for (const bad of [{ nome: 1 }, { nota: "4" }, { nota: Infinity }, { lido: "sim" }, { quando: "18/11/2026" }, { site: "javascript:x" }, { genero: "zzz" }, { tags: ["x", "x"] }, { tags: ["zzz"] }, { tags: "x" }, { rel: ["x"] }, { rel: [UUID, UUID] }]) {
      expect(parseProps(schema, bad), JSON.stringify(bad)).toBe("invalid_value");
    }
    expect(parseProps(schema, [])).toBe("invalid_props");
  });
});
