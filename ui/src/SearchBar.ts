// Search bar controller: free-text query with optional case-sensitive,
// whole-word, and regex matching, plus per-field scoping for the entry list filter.

import { getElanTextValues } from "./elanText";

export type EntryMatcher = (entry: any) => boolean;

export interface SearchBarConfig {
  getLexicon: () => any;
  // Called whenever the effective filter changes. `null` means "no filter"
  // (empty query, or an invalid regex pattern while typing).
  onFilterChange: (matcher: EntryMatcher | null) => void;
}

// Human-friendly labels for well-known ELAN lexicon fields. Custom fields
// fall back to their raw field name.
const KNOWN_FIELD_LABELS: Record<string, string> = {
  "lexical-unit": "Lexical Unit",
  variant: "Variants",
  "morph-type": "Morph Type",
  phonetic: "Phonetic",
  note: "Note",
  "grammatical-category": "Grammatical Category",
  gloss: "Gloss",
  definition: "Definition",
  example: "Example",
};

const KNOWN_FIELD_ORDER = Object.keys(KNOWN_FIELD_LABELS);

let inputEl: HTMLInputElement | null = null;
let caseToggleEl: HTMLButtonElement | null = null;
let regexToggleEl: HTMLButtonElement | null = null;
let wordToggleEl: HTMLButtonElement | null = null;
let fieldsBtnEl: HTMLButtonElement | null = null;
let popoverEl: HTMLElement | null = null;
let allFieldsCheckboxEl: HTMLInputElement | null = null;
let fieldsListEl: HTMLElement | null = null;

let getLexiconFn: (() => any) | null = null;
let onFilterChangeFn: ((matcher: EntryMatcher | null) => void) | null = null;

let query = "";
let caseSensitive = false;
let useRegex = false;
let wholeWord = false;
let allFields = true;
// Field names selected for scoped search. Only used when `allFields` is false.
// Field names are matched at both entry and sense level (e.g. a "note"
// checkbox searches entry notes and sense notes).
let selectedFields = new Set<string>();

let isInitialized = false;

export function init(config: SearchBarConfig) {
  if (isInitialized) return;

  inputEl = document.getElementById("searchInput") as HTMLInputElement | null;
  caseToggleEl = document.getElementById(
    "searchCaseToggle"
  ) as HTMLButtonElement | null;
  regexToggleEl = document.getElementById(
    "searchRegexToggle"
  ) as HTMLButtonElement | null;
  wordToggleEl = document.getElementById(
    "searchWordToggle"
  ) as HTMLButtonElement | null;
  fieldsBtnEl = document.getElementById(
    "searchFieldsBtn"
  ) as HTMLButtonElement | null;
  popoverEl = document.getElementById("searchFieldsPopover");
  allFieldsCheckboxEl = document.getElementById(
    "searchFieldAll"
  ) as HTMLInputElement | null;
  fieldsListEl = document.getElementById("searchFieldsList");

  if (
    !inputEl ||
    !caseToggleEl ||
    !regexToggleEl ||
    !wordToggleEl ||
    !fieldsBtnEl ||
    !popoverEl ||
    !allFieldsCheckboxEl ||
    !fieldsListEl
  ) {
    console.warn("Search bar markup missing required elements.");
    return;
  }

  getLexiconFn = config && typeof config.getLexicon === "function" ? config.getLexicon : null;
  onFilterChangeFn =
    config && typeof config.onFilterChange === "function"
      ? config.onFilterChange
      : null;

  inputEl.addEventListener("input", () => {
    query = inputEl!.value;
    notifyFilterChange();
  });

  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && inputEl!.value) {
      event.stopPropagation();
      reset();
    }
  });

  caseToggleEl.addEventListener("click", () => {
    caseSensitive = !caseSensitive;
    syncCaseToggle();
    notifyFilterChange();
    inputEl!.focus();
  });

  regexToggleEl.addEventListener("click", () => {
    useRegex = !useRegex;
    syncRegexToggle();
    notifyFilterChange();
    inputEl!.focus();
  });

  wordToggleEl.addEventListener("click", () => {
    wholeWord = !wholeWord;
    syncWordToggle();
    notifyFilterChange();
    inputEl!.focus();
  });

  fieldsBtnEl.addEventListener("click", () => {
    if (popoverEl!.classList.contains("hidden")) openPopover();
    else closePopover();
  });

  allFieldsCheckboxEl.addEventListener("change", () => {
    allFields = allFieldsCheckboxEl!.checked;
    if (!allFields && selectedFields.size === 0) {
      // Start from "everything selected" so the user can deselect fields.
      getAvailableFields().forEach((field) => selectedFields.add(field.name));
    }
    renderFieldsList();
    syncFieldsButton();
    notifyFilterChange();
  });

  isInitialized = true;
  syncCaseToggle();
  syncRegexToggle();
  syncWordToggle();
  syncFieldsButton();
}

// Clears the query and restores default options (plain text, all fields).
export function reset() {
  if (!isInitialized) return;
  query = "";
  caseSensitive = false;
  useRegex = false;
  wholeWord = false;
  allFields = true;
  selectedFields = new Set<string>();
  if (inputEl) inputEl.value = "";
  syncCaseToggle();
  syncRegexToggle();
  syncWordToggle();
  syncFieldsButton();
  closePopover();
  notifyFilterChange();
}

export function setEnabled(enabled: boolean) {
  if (!isInitialized) return;
  if (inputEl) inputEl.disabled = !enabled;
  if (caseToggleEl) caseToggleEl.disabled = !enabled;
  if (regexToggleEl) regexToggleEl.disabled = !enabled;
  if (wordToggleEl) wordToggleEl.disabled = !enabled;
  if (fieldsBtnEl) fieldsBtnEl.disabled = !enabled;
  if (!enabled) closePopover();
}

function syncCaseToggle() {
  if (!caseToggleEl) return;
  caseToggleEl.classList.toggle("active", caseSensitive);
  caseToggleEl.setAttribute("aria-pressed", caseSensitive ? "true" : "false");
}

function syncRegexToggle() {
  if (!regexToggleEl) return;
  regexToggleEl.classList.toggle("active", useRegex);
  regexToggleEl.setAttribute("aria-pressed", useRegex ? "true" : "false");
}

function syncWordToggle() {
  if (!wordToggleEl) return;
  wordToggleEl.classList.toggle("active", wholeWord);
  wordToggleEl.setAttribute("aria-pressed", wholeWord ? "true" : "false");
}

function syncFieldsButton() {
  if (!fieldsBtnEl) return;
  fieldsBtnEl.classList.toggle("active", !allFields);
  fieldsBtnEl.setAttribute("aria-pressed", !allFields ? "true" : "false");
}

function openPopover() {
  if (!popoverEl) return;
  renderFieldsList();
  popoverEl.classList.remove("hidden");
  document.addEventListener("mousedown", handleDocumentMouseDown);
  document.addEventListener("keydown", handleDocumentKeydown);
}

function closePopover() {
  if (!popoverEl || popoverEl.classList.contains("hidden")) return;
  popoverEl.classList.add("hidden");
  document.removeEventListener("mousedown", handleDocumentMouseDown);
  document.removeEventListener("keydown", handleDocumentKeydown);
}

function handleDocumentMouseDown(event: MouseEvent) {
  const target = event.target as Node | null;
  if (!target) return;
  if (popoverEl && popoverEl.contains(target)) return;
  if (fieldsBtnEl && fieldsBtnEl.contains(target)) return;
  closePopover();
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") closePopover();
}

function renderFieldsList() {
  if (!fieldsListEl || !allFieldsCheckboxEl) return;

  allFieldsCheckboxEl.checked = allFields;
  fieldsListEl.innerHTML = "";
  fieldsListEl.classList.toggle("disabled", allFields);

  getAvailableFields().forEach((field) => {
    const label = document.createElement("label");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = allFields || selectedFields.has(field.name);
    checkbox.dataset.fieldName = field.name;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedFields.add(field.name);
      else selectedFields.delete(field.name);
      notifyFilterChange();
    });

    const text = document.createElement("span");
    text.textContent = field.label;

    label.appendChild(checkbox);
    label.appendChild(text);
    fieldsListEl!.appendChild(label);
  });
}

// Discovers searchable fields from the current lexicon: entry-level and
// sense-level keys found in the data, plus custom fields declared in the
// header. Known fields come first in a stable order, extras alphabetically.
function getAvailableFields(): { name: string; label: string }[] {
  const names = new Set<string>();
  const lexicon = getLexiconFn ? getLexiconFn() : null;

  if (lexicon) {
    const entries = Array.isArray(lexicon.entry) ? lexicon.entry : [];
    entries.forEach((entry: any) => {
      if (!entry || typeof entry !== "object") return;
      Object.keys(entry).forEach((key) => {
        if (key === "$" || key === "sense") return;
        names.add(key);
      });
      const senses = Array.isArray(entry.sense)
        ? entry.sense
        : entry.sense
          ? [entry.sense]
          : [];
      senses.forEach((sense: any) => {
        if (!sense || typeof sense !== "object") return;
        Object.keys(sense).forEach((key) => {
          if (key === "$") return;
          names.add(key);
        });
      });
    });

    const header = Array.isArray(lexicon.header)
      ? lexicon.header[0]
      : lexicon.header;
    if (header && header["custom-fields"] && header["custom-fields"][0]) {
      const specs = header["custom-fields"][0]["field-spec"];
      const arr = Array.isArray(specs) ? specs : specs ? [specs] : [];
      arr.forEach((spec: any) => {
        if (spec && spec.$ && spec.$.name) names.add(spec.$.name);
      });
    }
  }

  const known = KNOWN_FIELD_ORDER.filter((name) => names.has(name));
  const extras = Array.from(names)
    .filter((name) => !KNOWN_FIELD_LABELS[name])
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  return known.concat(extras).map((name) => ({
    name,
    label: KNOWN_FIELD_LABELS[name] || name,
  }));
}

function notifyFilterChange() {
  if (!inputEl) return;

  let matcher: EntryMatcher | null = null;
  let invalidPattern = false;

  if (query) {
    const fields = allFields ? null : selectedFields;

    let pattern = useRegex
      ? query
      : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    if (wholeWord) {
      pattern = `\\b(?:${pattern})\\b`;
    }

    const flags = caseSensitive ? "" : "i";
    try {
      const re = new RegExp(pattern, flags);
      matcher = (entry) =>
        getSearchTextValues(entry, fields).some((text) => re.test(text));
    } catch {
      // Pattern is invalid (common mid-typing): keep the list unfiltered
      // and flag the input instead of hiding all entries.
      invalidPattern = true;
    }
  }

  inputEl.classList.toggle("invalid", invalidPattern);
  inputEl.title = invalidPattern ? "Invalid regular expression" : "";

  if (onFilterChangeFn) onFilterChangeFn(matcher);
}

function getSearchTextValues(entry: any, fields: Set<string> | null): string[] {
  const values: string[] = [];
  if (!entry || typeof entry !== "object") return values;

  Object.keys(entry).forEach((key) => {
    if (key === "$" || key === "sense") return;
    if (fields && !fields.has(key)) return;
    values.push(...getElanTextValues(entry[key]));
  });

  const senses = Array.isArray(entry.sense)
    ? entry.sense
    : entry.sense
      ? [entry.sense]
      : [];
  senses.forEach((sense: any) => {
    if (!sense || typeof sense !== "object") return;
    Object.keys(sense).forEach((key) => {
      if (key === "$") return;
      if (fields && !fields.has(key)) return;
      values.push(...getElanTextValues(sense[key]));
    });
  });

  return values.map((text) => text.trim()).filter(Boolean);
}
