export type ElanTextObject = {
  $?: Record<string, string>;
  _?: string;
  [key: string]: any;
};

export type ElanTextValue = string | number | boolean | null | ElanTextObject;

export function toElanTextArray(value: any): ElanTextValue[] {
  if (Array.isArray(value)) return value.slice();
  if (value === undefined || value === null) return [];
  return [value];
}

export function getElanText(value: any): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object") {
    const text = value._;
    if (text === undefined || text === null) return "";
    return typeof text === "string" ? text : String(text);
  }
  return "";
}

export function getElanTextValues(value: any): string[] {
  return toElanTextArray(value).map(getElanText);
}

export function getFirstElanText(value: any): string {
  const values = toElanTextArray(value);
  return values.length > 0 ? getElanText(values[0]) : "";
}

export function setFirstElanText(
  target: { [key: string]: any },
  fieldName: string,
  text: string
) {
  const values = toElanTextArray(target[fieldName]);
  const first = values[0];

  if (first && typeof first === "object" && !Array.isArray(first)) {
    values[0] = { ...first, _: text };
  } else {
    values[0] = text;
  }

  target[fieldName] = values;
}

export function setElanTextAt(values: any[], index: number, text: string) {
  const current = values[index];
  if (current && typeof current === "object" && !Array.isArray(current)) {
    values[index] = { ...current, _: text };
  } else {
    values[index] = text;
  }
}

export function findNamedElanFieldIndex(values: any, name: string): number {
  return toElanTextArray(values).findIndex(
    (value) =>
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      value.$ &&
      value.$.name === name
  );
}

// A field-spec declares the name and level; ELAN stores its value in field@name.
// Preserve existing direct elements from older editor files, but use ELAN's
// named-field representation for newly populated declarations.
export function resolveDeclaredElanField(
  target: Record<string, any>,
  declaration: { name: string; nameAttr?: string }
) {
  const name = declaration.name === "field"
    ? declaration.nameAttr || declaration.name
    : declaration.name;
  const values = toElanTextArray(target.field);
  const index = findNamedElanFieldIndex(values, name);
  if (index < 0 && declaration.name !== "field" &&
      Object.prototype.hasOwnProperty.call(target, name)) {
    return { name, fieldName: name, value: getFirstElanText(target[name]), customName: undefined };
  }
  return {
    name,
    fieldName: "field",
    customName: name,
    value: index >= 0 ? getElanText(values[index]) : "",
  };
}
