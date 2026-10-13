// Discover selectable fields from both XML-shaped lexicons. IDs identify records,
// rather than content, and are intentionally excluded from the selector.
export function discoverDiffFields(lexicons: any[]) {
  const entry = new Set<string>();
  const sense = new Set<string>();
  const list = (value: any): any[] => value == null ? [] : Array.isArray(value) ? value : [value];
  const collect = (node: any, fields: Set<string>) => {
    Object.keys(node || {}).forEach(key => {
      if (key === "$" || key === "sense" || key === "_") return;
      if (key === "field") {
        list(node.field).forEach(field => {
          if (field?.$?.name) fields.add(`field [name=${field.$.name}]`);
          else fields.add("field");
        });
      } else fields.add(key);
    });
    Object.keys(node?.$ || {}).filter(key => key !== "id").forEach(key => fields.add(key));
  };
  lexicons.forEach(source => {
    const lex = source?.lexicon || source;
    list(lex?.entry).forEach(e => {
      collect(e, entry);
      list(e.sense).forEach(s => collect(s, sense));
    });
    list(lex?.header).forEach(header => list(header?.["custom-fields"]).forEach(group =>
      list(group?.["field-spec"]).forEach(spec => {
        const { name, level = "entry" } = spec?.$ || {};
        if (name && (level === "entry" || level === "sense")) {
          (level === "entry" ? entry : sense).add(`field [name=${name}]`);
        }
      })
    ));
  });
  return { entry, sense };
}
