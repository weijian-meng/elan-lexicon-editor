// Lexicon Table Module

import { ElanTextValue, getElanText, getElanTextValues } from "./elanText";

export interface LexiconEntry {
  $: { id: string; dateCreated?: string; dateModified?: string };
  "lexical-unit"?: ElanTextValue | ElanTextValue[];
  "morph-type"?: ElanTextValue | ElanTextValue[];
  variant?: ElanTextValue | ElanTextValue[];
  sense?: LexiconSense[];
  [key: string]: any;
}

export interface LexiconSense {
  $: { id: string; order?: string };
  "grammatical-category"?: ElanTextValue | ElanTextValue[];
  gloss?: ElanTextValue | ElanTextValue[];
  [key: string]: any;
}

interface ColumnDefinition {
  id: string;
  label: string;
  className?: string;
  getValues: (entry: LexiconEntry) => any[];
}

interface DisplayConfig {
  columns: string[];
  expandMultiValue: boolean;
}

let tbodyEl: HTMLElement | null = null;
let headerRowEl: HTMLElement | null = null;
let headerCells: HTMLElement[] = [];
let onSelect: ((entry: LexiconEntry) => void) | null = null;

let storedEntries: LexiconEntry[] = [];
let selectedEntryId: string | null = null;
let lexicalOrderDefinition: string[] = [];
let lexicalOrderMap = new Map<string, number>();
let lexicalOrderMatchers: string[] = [];

const DEFAULT_COLUMNS = [
  "lexical-unit",
  "variants",
  "morph-type",
  "grammatical-category",
  "gloss",
];

const COLUMN_DEFINITIONS: ColumnDefinition[] = [
  {
    id: "lexical-unit",
    label: "Lexical Unit",
    className: "col-lexical-unit",
    getValues(entry) {
      if (!entry || !entry["lexical-unit"]) return [];
      return getElanTextValues(entry["lexical-unit"]);
    },
  },
  {
    id: "variants",
    label: "Variants",
    className: "col-variants",
    getValues(entry) {
      if (!entry || !entry.variant) return [];
      return getElanTextValues(entry.variant);
    },
  },
  {
    id: "morph-type",
    label: "Morph Type",
    className: "col-morph-type",
    getValues(entry) {
      if (!entry || !entry["morph-type"]) return [];
      return getElanTextValues(entry["morph-type"]);
    },
  },
  {
    id: "grammatical-category",
    label: "Grammatical Category",
    className: "col-grammatical-category",
    getValues(entry) {
      const senses = (entry && entry.sense) || [];
      const values: string[] = [];
      senses.forEach((sense) => {
        if (!sense) return;
        values.push(...getElanTextValues(sense["grammatical-category"]));
      });
      return values;
    },
  },
  {
    id: "gloss",
    label: "Gloss",
    className: "col-gloss",
    getValues(entry) {
      const senses = (entry && entry.sense) || [];
      const values: string[] = [];
      senses.forEach((sense) => {
        if (!sense) return;
        values.push(...getElanTextValues(sense.gloss));
      });
      return values;
    },
  },
];

const columnMap = new Map(COLUMN_DEFINITIONS.map((def) => [def.id, def]));

let displayConfig: DisplayConfig = {
  columns: DEFAULT_COLUMNS.slice(),
  expandMultiValue: false,
};

const sortState = {
  field: "lexical-unit",
  direction: "asc",
};

export function init(opts: {
  tbody: HTMLElement | null;
  headerRow?: HTMLElement | null;
  onSelect?: (entry: LexiconEntry) => void;
}) {
  tbodyEl = opts && opts.tbody ? opts.tbody : null;
  headerRowEl =
    opts && opts.headerRow
      ? opts.headerRow
      : document.querySelector(".lexicon-table thead tr");
  onSelect =
    opts && typeof opts.onSelect === "function" ? opts.onSelect : null;

  renderHeader();
  updateHeaderIndicators();
}

export function render(
  entries: LexiconEntry[],
  selectedId: string | null,
  options?: { sortOrder?: string }
) {
  if (!tbodyEl) return;

  storedEntries = Array.isArray(entries) ? entries.slice() : [];
  selectedEntryId = selectedId || null;

  applySortOrder(options && options.sortOrder);
  applySortAndRender();
}

export function setDisplayConfig(config: Partial<DisplayConfig>) {
  if (!config || typeof config !== "object") return;

  const next: DisplayConfig = {
    columns: displayConfig.columns.slice(),
    expandMultiValue: displayConfig.expandMultiValue,
  };

  if (Object.prototype.hasOwnProperty.call(config, "columns")) {
    const sanitized = sanitizeColumns(config.columns);
    if (sanitized.length > 0) {
      next.columns = sanitized;
    } else if (next.columns.length === 0) {
      next.columns = DEFAULT_COLUMNS.slice();
    }
  }

  if (Object.prototype.hasOwnProperty.call(config, "expandMultiValue")) {
    next.expandMultiValue = !!config.expandMultiValue;
  }

  applyDisplayConfig(next);
}

function applyDisplayConfig(nextConfig: DisplayConfig) {
  displayConfig = {
    columns:
      Array.isArray(nextConfig.columns) && nextConfig.columns.length > 0
        ? nextConfig.columns.slice()
        : DEFAULT_COLUMNS.slice(),
    expandMultiValue: !!nextConfig.expandMultiValue,
  };

  ensureSortField();
  renderHeader();
  applySortAndRender();
}

function sanitizeColumns(columns: any): string[] {
  if (!Array.isArray(columns)) return displayConfig.columns.slice();

  const requested = columns
    .map((column: any) => normalizeField(column))
    .filter(Boolean);

  const seen = new Set();
  const result: string[] = [];
  COLUMN_DEFINITIONS.forEach((def) => {
    if (requested.includes(def.id) && !seen.has(def.id)) {
      result.push(def.id);
      seen.add(def.id);
    }
  });

  return result;
}

export function getDisplayConfig() {
  return {
    columns: displayConfig.columns.slice(),
    expandMultiValue: displayConfig.expandMultiValue,
  };
}

export function getAvailableColumns() {
  return COLUMN_DEFINITIONS.map((def) => ({
    id: def.id,
    label: def.label,
    defaultSelected: DEFAULT_COLUMNS.includes(def.id),
  }));
}

function renderHeader() {
  if (!headerRowEl) return;

  headerRowEl.innerHTML = "";
  headerCells = [];

  displayConfig.columns.forEach((columnId) => {
    const def = columnMap.get(columnId);
    if (!def) return;

    const th = document.createElement("th");
    th.textContent = def.label;
    th.dataset.field = def.id;
    th.classList.add("sortable");
    if (def.className) th.classList.add(def.className);
    th.addEventListener("click", () => handleHeaderClick(def.id));

    headerRowEl!.appendChild(th);
    headerCells.push(th);
  });

  updateHeaderIndicators();
}

function ensureSortField() {
  if (!displayConfig.columns.includes(sortState.field)) {
    sortState.field =
      displayConfig.columns.length > 0 ? displayConfig.columns[0] : "";
    sortState.direction = "asc";
  }
}

function applySortOrder(sortOrderDefinition?: string) {
  const definition =
    typeof sortOrderDefinition === "string" ? sortOrderDefinition : "";
  const tokens = definition
    .split(/[\s,]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  lexicalOrderDefinition = [];
  lexicalOrderMap = new Map();
  lexicalOrderMatchers = [];

  tokens.forEach((token) => {
    if (!lexicalOrderMap.has(token)) {
      lexicalOrderMap.set(token, lexicalOrderMap.size);
      lexicalOrderDefinition.push(token);
    }
  });

  lexicalOrderMatchers = lexicalOrderDefinition
    .slice()
    .sort((a, b) => b.length - a.length);
}

function applySortAndRender() {
  if (!tbodyEl) return;

  ensureSortField();

  tbodyEl.innerHTML = "";
  tbodyEl.dataset.viewMode = displayConfig.expandMultiValue
    ? "expanded"
    : "collapsed";

  const sortedEntries = storedEntries
    .slice()
    .sort(createComparator(sortState.field));
  if (sortState.direction === "desc") {
    sortedEntries.reverse();
  }

  sortedEntries.forEach((entry) => {
    try {
      const row = document.createElement("tr");
      const entryId = (entry && entry.$ && entry.$.id) || "";
      row.dataset.entryId = entryId;

      displayConfig.columns.forEach((columnId) => {
        const def = columnMap.get(columnId);
        if (!def) return;
        const cell = document.createElement("td");
        if (def.className) cell.classList.add(def.className);
        cell.textContent = getColumnValue(entry, def.id);
        row.appendChild(cell);
      });

      if (selectedEntryId && entryId === selectedEntryId) {
        row.classList.add("selected");
      }

      if (onSelect) {
        row.addEventListener("click", () => onSelect!(entry));
      }

      tbodyEl!.appendChild(row);
    } catch (e) {
      console.error("Error rendering row:", e);
    }
  });

  updateHeaderIndicators();
}

function handleHeaderClick(field: string) {
  if (!field) return;
  const normalizedField = normalizeField(field);
  if (!displayConfig.columns.includes(normalizedField)) return;

  if (sortState.field === normalizedField) {
    sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
  } else {
    sortState.field = normalizedField;
    sortState.direction = "asc";
  }
  applySortAndRender();
}

function createComparator(field: string) {
  const normalizedField = normalizeField(field);
  return (a: LexiconEntry, b: LexiconEntry) => {
    const valueA = getColumnValue(a, normalizedField);
    const valueB = getColumnValue(b, normalizedField);

    const comparison = compareValues(valueA, valueB, normalizedField);
    if (comparison !== 0) return comparison;

    const fallback = compareValues(
      getColumnValue(a, "lexical-unit"),
      getColumnValue(b, "lexical-unit"),
      "lexical-unit"
    );
    if (fallback !== 0) return fallback;

    const idA = (a && a.$ && a.$.id) || "";
    const idB = (b && b.$ && b.$.id) || "";
    return idA.localeCompare(idB);
  };
}

function compareValues(valueA: any, valueB: any, field: string) {
  const a = (valueA || "").toString();
  const b = (valueB || "").toString();

  if (field === "lexical-unit" && lexicalOrderDefinition.length > 0) {
    const customOrderComparison = compareWithCustomOrder(a, b);
    if (customOrderComparison !== 0) return customOrderComparison;
  }

  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function compareWithCustomOrder(a: string, b: string) {
  const keyA = buildCustomOrderKey(a);
  const keyB = buildCustomOrderKey(b);

  const length = Math.max(keyA.length, keyB.length);
  for (let i = 0; i < length; i++) {
    const valA = keyA[i];
    const valB = keyB[i];
    if (valA === undefined) return valB === undefined ? 0 : -1;
    if (valB === undefined) return 1;
    if (valA !== valB) return valA - valB;
  }
  return 0;
}

function buildCustomOrderKey(value: string) {
  const lowerValue = (value || "").toLowerCase();
  const key: number[] = [];

  for (let i = 0; i < lowerValue.length;) {
    let matched = false;
    for (let j = 0; j < lexicalOrderMatchers.length; j++) {
      const token = lexicalOrderMatchers[j];
      if (token && lowerValue.startsWith(token, i)) {
        key.push(lexicalOrderMap.get(token)!);
        i += token.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      key.push(lexicalOrderDefinition.length + lowerValue.charCodeAt(i));
      i += 1;
    }
  }

  return key;
}

function getColumnValue(entry: LexiconEntry, field: string) {
  const values = getColumnValues(entry, field);
  return formatValues(values);
}

function getColumnValues(entry: LexiconEntry, field: string) {
  const normalizedField = normalizeField(field);
  const def = columnMap.get(normalizedField);
  if (!def || typeof def.getValues !== "function") return [];
  try {
    const values = def.getValues(entry);
    return Array.isArray(values) ? values : toArray(values);
  } catch (e) {
    console.error("Failed to resolve values for field", normalizedField, e);
    return [];
  }
}

function formatValues(values: any[]) {
  const sanitized = (Array.isArray(values) ? values : [])
    .map((val) => getElanText(val).trim())
    .filter((val) => val.length > 0);

  if (sanitized.length === 0) return "";

  if (displayConfig.expandMultiValue && sanitized.length > 1) {
    return sanitized.join("\n");
  }

  return sanitized.length === 1 ? sanitized[0] : sanitized.join(" | ");
}

function toArray(value: any) {
  if (Array.isArray(value)) return value.slice();
  if (value === undefined || value === null) return [];
  return [value];
}

function normalizeField(field: any) {
  if (!field) return "";
  return field.toString().toLowerCase();
}

function updateHeaderIndicators() {
  if (!Array.isArray(headerCells)) return;
  headerCells.forEach((th) => {
    if (!th || !th.dataset) return;
    const field = normalizeField(th.dataset.field);
    if (field === sortState.field) {
      th.dataset.sortDirection = sortState.direction;
    } else {
      delete th.dataset.sortDirection;
    }
  });
}
