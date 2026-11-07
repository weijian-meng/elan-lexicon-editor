// Entry Editor Module

import {
  ElanTextObject,
  ElanTextValue,
  findNamedElanFieldIndex,
  resolveDeclaredElanField,
  getElanText,
  getElanTextValues,
  getFirstElanText,
  setElanTextAt,
  setFirstElanText,
  toElanTextArray,
} from "./elanText";
import { LexiconEntry, LexiconSense } from "./LexiconTable";

type Lexicon = {
  header?: any;
  entry?: LexiconEntry[];
};

interface FieldGroup {
  id: string;
  label: string;
  foldable?: boolean;
  collapsedByDefault?: boolean;
  fields: string[];
}

interface RecordListDescriptor {
  type: "record-list";
  description?: string;
  recordSeparator: string;
  recordDelimiters: [string, string];
  pairSeparator: string;
  kvSeparator: string;
  keyOrder: string[];
  columnLabels?: Record<string, string>;
  groupBy?: string;
  render: string;
}

interface KeyedListDescriptor {
  type: "keyed-list";
  description?: string;
  recordSeparator: string;
  recordDelimiters: [string, string];
  kvSeparator: string;
  keyLabel: string;
  valueLabel: string;
  render: string;
  attachTo?: string;
  editable?: boolean;
}

type FieldDescriptor = RecordListDescriptor | KeyedListDescriptor;

interface ViewConfig {
  "field-groups"?: FieldGroup[];
  parsers?: Record<string, FieldDescriptor>;
}

export interface EntryEditorOptions {
  getLexicon: () => Lexicon | null;
  onChange: () => void;
}

let getLexicon: (() => Lexicon | null) | null = null;
let onChange: (() => void) | null = null;

// DOM refs
let refs: { [key: string]: HTMLElement | null } = {};
let selectedEntry: LexiconEntry | null = null;

// Track original state for discard functionality
let originalEntry: string | null = null;

// Sidecar view config for field grouping
let viewConfig: ViewConfig | null = null;

const AUTOCOMPLETE_IDS = {
  morphType: "morphTypeOptions",
  grammaticalCategory: "grammaticalCategoryOptions",
};
const datalistRefs: { [key: string]: HTMLDataListElement } = {};

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

// Ensure there is a datalist element for the given id
function ensureDatalist(id: string): HTMLDataListElement {
  if (datalistRefs[id]) return datalistRefs[id];
  const dl = document.createElement("datalist");
  dl.id = id;
  document.body.appendChild(dl);
  datalistRefs[id] = dl;
  return dl;
}

// Replace the contents of a datalist with the provided values
function setDatalistOptions(dl: HTMLDataListElement, values: string[]) {
  if (!dl) return;
  dl.innerHTML = "";
  values.forEach((val) => {
    const opt = document.createElement("option");
    opt.value = val;
    dl.appendChild(opt);
  });
}

function attachAutocomplete(input: HTMLInputElement | null, datalistId: string) {
  if (!input) return;
  ensureDatalist(datalistId);
  input.setAttribute("list", datalistId);
  input.setAttribute("autocomplete", "off");
}

function collectEntryFieldValues(fieldName: string): string[] {
  const lexicon = getLexicon ? getLexicon() : null;
  if (!lexicon || !Array.isArray(lexicon.entry)) return [];
  const values = new Set<string>();
  lexicon.entry!.forEach((entry) => {
    if (!entry) return;
    getElanTextValues(entry[fieldName]).forEach((text) => {
      const normalized = text.trim();
      if (normalized) values.add(normalized);
    });
  });
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

function collectSenseFieldValues(fieldName: string): string[] {
  const lexicon = getLexicon ? getLexicon() : null;
  if (!lexicon || !Array.isArray(lexicon.entry)) return [];
  const values = new Set<string>();
  lexicon.entry!.forEach((entry) => {
    const senses = entry && Array.isArray(entry.sense) ? entry.sense : [];
    senses.forEach((sense) => {
      if (!sense) return;
      getElanTextValues(sense[fieldName]).forEach((text) => {
        const normalized = text.trim();
        if (normalized) values.add(normalized);
      });
    });
  });
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

function getFieldArray(value: any) {
  return toElanTextArray(value);
}

function getNamedFieldText(value: any, name: string) {
  const fields = getFieldArray(value);
  const idx = findNamedElanFieldIndex(fields, name);
  return idx >= 0 ? getElanText(fields[idx]) : "";
}

function setNamedFieldText(target: { [key: string]: any }, name: string, text: string) {
  const fields = getFieldArray(target.field);
  const idx = findNamedElanFieldIndex(fields, name);

  if (idx >= 0) {
    setElanTextAt(fields, idx, text);
  } else {
    fields.push({ $: { name }, _: text });
  }

  target.field = fields;
}

function setNoteArray(entry: LexiconEntry, notes: any[]) {
  if (notes.length > 0) {
    entry.note = notes;
  } else {
    entry.note = null;
  }
}

type KeyedPair = { key: string; value: string };
type MetadataRecord = { raw: string; pair: KeyedPair | null };
const metadataParents = ["variant", "phonetic"] as const;
type MetadataParent = typeof metadataParents[number];

// Keep drafts outside the XML model. Row identity survives rerenders and
// deleting neighboring rows, even when several rows have no spelling yet.
const metadataDrafts = new WeakMap<ElanTextObject, Map<string, string>>();

function getMetadataDraft(row: ElanTextValue | undefined) {
  return row && typeof row === "object" ? metadataDrafts.get(row) : undefined;
}

function hasMetadataDraft(entry: LexiconEntry) {
  return metadataParents.some((field) => toElanTextArray(entry[field]).some(getMetadataDraft));
}

export function findEntryWithMetadataDraft() {
  return getLexicon?.()?.entry?.find(hasMetadataDraft);
}

function getAttachedMetadataDescriptors(structuralField: string) {
  return Object.entries(viewConfig?.parsers || {}).filter(
    (entry): entry is [string, KeyedListDescriptor] =>
      entry[1].type === "keyed-list" && entry[1].attachTo === structuralField
  );
}

function readAttachedMetadata(entry: LexiconEntry, name: string, desc: KeyedListDescriptor) {
  const field = resolveDeclaredElanField(entry, { name });
  const values = field.customName
    ? getFieldArray(entry.field).filter((value) =>
      value && typeof value === "object" && value.$?.name === field.customName)
    : getFieldArray(entry[field.fieldName]);
  const records: MetadataRecord[] = field.value.trim()
    ? field.value.split(desc.recordSeparator).map((raw) => {
      const [open, close] = desc.recordDelimiters;
      const text = raw.trim();
      const framed = (!open || text.startsWith(open)) && (!close || text.endsWith(close));
      // Older files can omit both delimiters. A partly delimited record could
      // be a fragment of a value containing the record separator.
      const bare = (!open || !text.startsWith(open)) && (!close || !text.endsWith(close));
      return { raw, pair: framed || bare ? parseKeyedListRecord(text, desc) : null };
    })
    : [];
  let error = "";
  if (values.length > 1) error = `Resolve the duplicate custom fields for ${name} first.`;
  else if (records.some(({ pair }) => !pair)) error = `Check the stored format of ${name} first.`;
  return { field, records, error };
}

function metadataMatches(records: MetadataRecord[], key: string) {
  // In beta 6, new rows could leave behind keyless values. Their owner is unknown.
  return key ? records.filter(({ pair }) => pair?.key === key && pair.value) : [];
}

function makeMetadataRecord(key: string, value: string, desc: KeyedListDescriptor) {
  const [open, close] = desc.recordDelimiters;
  const raw = `${open}${key}${desc.kvSeparator} ${value}${close}`;
  if (!desc.recordSeparator || !desc.kvSeparator || raw.includes(desc.recordSeparator)) return null;
  const pair = parseKeyedListRecord(raw, desc);
  return pair?.key === key && pair.value === value ? { raw, pair } : null;
}

function writeAttachedMetadata(
  entry: LexiconEntry,
  field: ReturnType<typeof resolveDeclaredElanField>,
  records: MetadataRecord[],
  desc: KeyedListDescriptor
) {
  const value = records
    .filter(({ pair }) => !pair || pair.value)
    .map(({ raw }) => raw)
    .join(desc.recordSeparator);
  if (value === field.value) return;
  if (field.customName) setNamedFieldText(entry, field.customName, value);
  else setFirstElanText(entry, field.fieldName, value);
}

function getMetadataInputState(
  structuralField: string, index: number, name: string, desc: KeyedListDescriptor
) {
  if (!selectedEntry) return { value: "", error: "No entry selected." };
  const forms = toElanTextArray(selectedEntry[structuralField]);
  const { records, error } = readAttachedMetadata(selectedEntry, name, desc);
  if (error) return { value: "", error };
  const key = getElanText(forms[index]).trim();
  if (!key) {
    return {
      value: getMetadataDraft(forms[index])?.get(name) || "",
      error: "",
      hint: "Draft until you enter a spelling.",
    };
  }
  if (forms.filter((form) => getElanText(form).trim() === key).length !== 1) {
    return { value: "", error: "Metadata needs a unique spelling." };
  }
  const matches = metadataMatches(records, key);
  if (matches.length > 1) {
    return { value: "", error: `Resolve the duplicate records in ${name} before editing.` };
  }
  return { value: matches[0]?.pair?.value || "", error: "" };
}

function handleMetadataChange(
  structuralField: string, index: number, name: string, desc: KeyedListDescriptor, value: string
) {
  if (!selectedEntry) return;
  const state = getMetadataInputState(structuralField, index, name, desc);
  if (state.error) return state.error;
  const forms = toElanTextArray(selectedEntry[structuralField]);
  if (index >= forms.length) return;
  const row = forms[index];
  const key = getElanText(row).trim();
  const nextValue = value.trim();
  if (nextValue === state.value) return;
  const replacement = nextValue ? makeMetadataRecord(key, nextValue, desc) : null;
  if (nextValue && !replacement) return "This text contains a separator used by the metadata field.";

  if (!key) {
    const draftRow = row && typeof row === "object" ? row : { _: getElanText(row) };
    const draft = getMetadataDraft(draftRow) || new Map<string, string>();
    if (nextValue) draft.set(name, nextValue);
    else draft.delete(name);
    if (draft.size) metadataDrafts.set(draftRow, draft);
    else metadataDrafts.delete(draftRow);
    forms[index] = draftRow;
    selectedEntry[structuralField] = forms;
    markChanged(false);
    return;
  }

  const { field, records } = readAttachedMetadata(selectedEntry, name, desc);
  const [previous] = metadataMatches(records, key);
  if (previous) {
    records.splice(records.indexOf(previous), 1, ...(replacement ? [replacement] : []));
  } else if (replacement) {
    records.push(replacement);
  } else {
    return;
  }
  writeAttachedMetadata(selectedEntry, field, records, desc);
  markChanged();
}

function bindValidatedTextInput(
  input: HTMLInputElement, readValue: () => string, onEdit: (value: string) => string | void
) {
  input.oninput = () => {
    const error = onEdit(input.value) || "";
    input.setCustomValidity(error);
    if (error) input.reportValidity();
  };
  input.onblur = () => {
    if (input.validity.customError) {
      input.value = readValue();
      input.setCustomValidity("");
    }
  };
}

function fillMultiFieldContainer(
  container: HTMLElement,
  values: any,
  inputClassName: string,
  groupClassName: string,
  onChange: (index: number, value: string) => string | void,
  onRemove: (index: number) => void,
  minItems?: number,
  structuralField?: string
): void {
  container.innerHTML = "";
  const items = toElanTextArray(values);
  const attachedDescs = structuralField ? getAttachedMetadataDescriptors(structuralField) : [];
  const refreshMetadata: (() => void)[] = [];
  items.forEach((item, index) => {
    const group = document.createElement("div");
    group.className = groupClassName;

    const inputRow = document.createElement("div");
    inputRow.className = "multi-field-input-row";

    const input = document.createElement("input");
    input.type = "text";
    input.value = getElanText(item);
    input.className = inputClassName;
    if (structuralField && attachedDescs.length > 0) {
      bindValidatedTextInput(input, () => getElanTextValues(selectedEntry?.[structuralField])[index] || "", (value) => {
        const error = onChange(index, value);
        if (!error) refreshMetadata.forEach((refresh) => refresh());
        return error;
      });
    } else {
      input.oninput = () => onChange(index, input.value);
    }

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.className = "button danger small";
    if (minItems && items.length <= minItems) {
      removeButton.disabled = true;
    }
    removeButton.onclick = () => onRemove(index);

    inputRow.appendChild(input);
    inputRow.appendChild(removeButton);
    group.appendChild(inputRow);

    // Render attached metadata inline
    if (structuralField && attachedDescs.length > 0) {
      const metaContainer = document.createElement("div");
      metaContainer.className = "metadata-inline-container";
      for (const [name, desc] of attachedDescs) {
        const metaRow = document.createElement("div");
        metaRow.className = "metadata-row";

        const metaLabel = document.createElement("label");
        metaLabel.className = "metadata-label";
        metaLabel.textContent = desc.valueLabel;

        const metaInput = document.createElement("input");
        metaInput.type = "text";
        metaInput.className = "metadata-input";
        const read = () => getMetadataInputState(structuralField, index, name, desc);
        const refresh = () => {
          const { value, error, hint } = read();
          metaInput.value = value;
          metaInput.setCustomValidity("");
          metaInput.readOnly = !desc.editable || !!error;
          metaInput.title = error || hint || "";
          metaInput.placeholder = metaInput.title;
        };
        refreshMetadata.push(refresh);
        refresh();
        if (desc.editable) {
          bindValidatedTextInput(metaInput, () => read().value, (value) =>
            handleMetadataChange(structuralField, index, name, desc, value));
        }

        metaRow.appendChild(metaLabel);
        metaRow.appendChild(metaInput);
        metaContainer.appendChild(metaRow);
      }
      group.appendChild(metaContainer);
    }

    container.appendChild(group);
  });

  syncOptionalSectionEmptyState(container);
}

// Toggle compact "empty section" treatment for optional sections. When the
// list is empty, the section collapses to a header + short empty hint; when
// populated, the full card style applies. Sections without the
// `optional-section` marker (e.g. Variants, Gloss) are left unchanged.
function syncOptionalSectionEmptyState(container: HTMLElement): void {
  const section = container.parentElement as HTMLElement | null;
  if (!section || !section.classList.contains("optional-section")) return;

  const isEmpty = container.children.length === 0;
  section.classList.toggle("empty", isEmpty);

  let hint = section.querySelector(".section-empty-hint") as HTMLElement | null;
  if (isEmpty) {
    if (!hint) {
      hint = document.createElement("div");
      hint.className = "section-empty-hint";
      const labelEl = section.querySelector(".section-header .section-label") as HTMLElement | null;
      const labelText = labelEl ? (labelEl.textContent || "").trim() : "";
      hint.textContent = labelText ? `No ${labelText.toLowerCase()} added` : "Nothing added";
      section.appendChild(hint);
    }
  } else if (hint) {
    hint.remove();
  }
}

function appendMultiFieldSection(
  parent: HTMLElement,
  label: string,
  fieldKey: string,
  values: any,
  onChange: (index: number, value: string) => void,
  onRemove: (index: number) => void,
  onAdd: () => void,
  minItems?: number,
  structuralField?: string,
  optional?: boolean
): void {
  const section = document.createElement("div");
  section.className = `${fieldKey}-section`;
  if (optional) section.classList.add("optional-section");

  const header = document.createElement("div");
  header.className = "section-header";

  const labelEl = document.createElement("div");
  labelEl.className = "section-label";
  labelEl.textContent = label;

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.textContent = `Add ${label}`;
  addButton.className = "button secondary small";
  addButton.onclick = onAdd;

  header.appendChild(labelEl);
  header.appendChild(addButton);

  const list = document.createElement("div");
  list.className = `${fieldKey}-list`;

  section.appendChild(header);
  section.appendChild(list);
  parent.appendChild(section);

  fillMultiFieldContainer(
    list,
    values,
    `${fieldKey}-input`,
    `${fieldKey}-group`,
    onChange,
    onRemove,
    minItems,
    structuralField
  );
}

// Refresh the shared datalists so morph-type and grammatical-category inputs can suggest existing values
function refreshAutocompleteOptions() {
  const morphOptions = collectEntryFieldValues("morph-type");
  const morphDatalist = ensureDatalist(AUTOCOMPLETE_IDS.morphType);
  setDatalistOptions(morphDatalist, morphOptions);

  const gramOptions = collectSenseFieldValues("grammatical-category");
  const gramDatalist = ensureDatalist(AUTOCOMPLETE_IDS.grammaticalCategory);
  setDatalistOptions(gramDatalist, gramOptions);

  attachAutocomplete(
    refs.morphTypeInput as HTMLInputElement,
    AUTOCOMPLETE_IDS.morphType
  );
}

// refreshAutocompleteOptions scans the whole lexicon; debounce it so it does
// not run on every keystroke while typing in entry fields.
let autocompleteRefreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAutocompleteRefresh() {
  if (autocompleteRefreshTimer) clearTimeout(autocompleteRefreshTimer);
  autocompleteRefreshTimer = setTimeout(() => {
    autocompleteRefreshTimer = null;
    refreshAutocompleteOptions();
  }, 400);
}

export function setViewConfig(config: ViewConfig | null) {
  viewConfig = config;
}

export function init(options: EntryEditorOptions) {
  getLexicon =
    options && typeof options.getLexicon === "function"
      ? options.getLexicon
      : null;
  onChange =
    options && typeof options.onChange === "function" ? options.onChange : null;

  refs.entryDetails = $("entryDetails");
  refs.emptySelection = $("emptySelection");
  refs.lexicalUnitInput = $("lexicalUnit");
  refs.morphTypeInput = $("morphType");
  refs.sensesContainer = $("sensesContainer");
  refs.addSenseBtn = $("addSenseBtn");
  refs.entryIdInput = $("entryId");
  refs.dateCreatedInput = $("dateCreated");
  refs.dateModifiedInput = $("dateModified");
  refs.variantsContainer = $("variantsContainer");
  refs.addVariantBtn = $("addVariantBtn");
  refs.phoneticContainer = $("phoneticContainer");
  refs.addPhoneticBtn = $("addPhoneticBtn");
  refs.noteContainer = $("noteContainer");
  refs.addNoteBtn = $("addNoteBtn");
  refs.entryCustomFieldsContainer = $("entryCustomFieldsContainer");
  refs.entryHeader = $("entryHeaderTitle");
  refs.entryHeaderBar = $("entryHeaderBar");
  refs.entryStatus = $("entryStatus");
  refs.discardChangesBtn = $("discardChangesBtn");

  if (refs.addSenseBtn) refs.addSenseBtn.onclick = handleAddSense;
  if (refs.addVariantBtn) refs.addVariantBtn.onclick = handleAddVariant;
  if (refs.addPhoneticBtn) refs.addPhoneticBtn.onclick = handleAddPhonetic;
  if (refs.addNoteBtn) refs.addNoteBtn.onclick = handleAddNote;
  if (refs.discardChangesBtn) {
    refs.discardChangesBtn.onclick = handleDiscardChanges;
  }

  // Use 'input' event for immediate change detection to avoid blur/click race conditions
  if (refs.lexicalUnitInput) refs.lexicalUnitInput.addEventListener("input", updateEntryFromForm);
  if (refs.morphTypeInput) refs.morphTypeInput.addEventListener("input", updateEntryFromForm);

  ensureDatalist(AUTOCOMPLETE_IDS.morphType);
  ensureDatalist(AUTOCOMPLETE_IDS.grammaticalCategory);
}

function updateEntryHeading() {
  if (!refs.entryHeader || !selectedEntry) return;

  const lexicalUnit = getFirstElanText(selectedEntry["lexical-unit"]);
  if (lexicalUnit.trim()) {
    const prefix = document.createElement("span");
    prefix.className = "entry-header-prefix";
    prefix.textContent = "Entry:";

    const value = document.createElement("span");
    value.className = "entry-lexical-unit";
    value.textContent = lexicalUnit;

    refs.entryHeader.replaceChildren(prefix, value);
  } else {
    refs.entryHeader.textContent = "Entry Details";
  }
}

function markChanged(updateTimestamp = true) {
  console.log("EntryEditor: markChanged called");
  if (updateTimestamp && selectedEntry && selectedEntry.$) {
    selectedEntry.$.dateModified = new Date().toISOString();
  }

  if (refs.entryStatus) {
    refs.entryStatus.textContent = "Modified";
    refs.entryStatus.classList.add("modified");
  }
  if (refs.discardChangesBtn) {
    (refs.discardChangesBtn as HTMLButtonElement).disabled = false;
  }

  if (onChange) onChange();
}

function handleDiscardChanges() {
  if (!originalEntry || !selectedEntry) return;

  // confirm is optional here, maybe nice to have
  if (!confirm("Discard all changes to this entry?")) return;

  // Restore deep copy
  const restored = JSON.parse(originalEntry);

  // Update selectedEntry in place (keeping reference if possible, or we need to update parent)
  // Since selectedEntry is a reference to an object inside currentLexicon.entry array, we can modify properties.
  // However, safest is to clear all props and copy back.
  Object.keys(selectedEntry).forEach(key => delete selectedEntry![key]);
  Object.assign(selectedEntry, restored);

  renderEntryForm();

  // Reset status
  if (refs.entryStatus) {
    refs.entryStatus.textContent = "No changes";
    refs.entryStatus.classList.remove("modified");
  }
  if (refs.discardChangesBtn) {
    (refs.discardChangesBtn as HTMLButtonElement).disabled = true;
  }

  // Notify parent that we "changed" (reverted) so table updates (if anything changed in table view)
  if (onChange) onChange();
}

export function clear() {
  selectedEntry = null;
  if (refs.emptySelection) refs.emptySelection.classList.remove("hidden");
  if (refs.entryDetails) refs.entryDetails.classList.add("hidden");
  if (refs.entryHeaderBar) refs.entryHeaderBar.classList.add("hidden");
  // Remove any custom field elements
  if (refs.entryDetails) {
    refs.entryDetails
      .querySelectorAll(".custom-field-group")
      .forEach((g) => g.remove());
  }
  if (refs.entryCustomFieldsContainer) {
    refs.entryCustomFieldsContainer.innerHTML = "";
  }
  if (refs.sensesContainer) refs.sensesContainer.innerHTML = "";
  if (refs.variantsContainer) refs.variantsContainer.innerHTML = "";
  if (refs.phoneticContainer) refs.phoneticContainer.innerHTML = "";
  if (refs.noteContainer) refs.noteContainer.innerHTML = "";
}

function addMetadataParent(field: MetadataParent) {
  if (!selectedEntry) return;
  selectedEntry[field] = [...toElanTextArray(selectedEntry[field]), ""];
  renderEntryForm();
  markChanged();
}

function updateMetadataParent(field: MetadataParent, index: number, value: string | null) {
  if (!selectedEntry) return;
  const entry = selectedEntry;
  const forms = toElanTextArray(entry[field]);
  if (index < 0 || index >= forms.length) return;
  const row = forms[index];
  const draft = getMetadataDraft(row);
  const oldKey = getElanText(row).trim();
  const newKey = value?.trim() || "";
  const descriptors = getAttachedMetadataDescriptors(field);
  const siblings = forms.filter((_, i) => i !== index).map((form) => getElanText(form).trim());
  const writes: (() => void)[] = [];

  if (oldKey !== newKey) {
    if (descriptors.length && newKey && siblings.includes(newKey)) {
      return "Use a unique spelling so its metadata can be matched.";
    }

    for (const [name, desc] of descriptors) {
      const { field: binding, records, error } = readAttachedMetadata(entry, name, desc);
      if (error) return error;
      if (metadataMatches(records, newKey).length > 0) {
        return `The spelling already has an unmatched record in ${name}.`;
      }

      const matches = metadataMatches(records, oldKey);
      if (matches.length && (matches.length > 1 || siblings.includes(oldKey))) {
        return `Resolve the ambiguous records in ${name} before changing this spelling.`;
      }
      const previous = matches[0];
      const metadataValue = previous?.pair?.value || draft?.get(name);
      if (!metadataValue) continue;
      if (value !== null && !newKey) {
        return "Enter a new spelling, or clear its metadata before leaving it blank.";
      }
      if (value === null) {
        if (previous) records.splice(records.indexOf(previous), 1);
      } else {
        const replacement = makeMetadataRecord(newKey, metadataValue, desc);
        if (!replacement) return "This spelling contains a separator used by the metadata field.";
        if (previous) records.splice(records.indexOf(previous), 1, replacement);
        else records.push(replacement);
      }
      writes.push(() => writeAttachedMetadata(entry, binding, records, desc));
    }
  }

  // Commit only after every attached field has passed validation.
  if (value === null) forms.splice(index, 1);
  else setElanTextAt(forms, index, value);
  if (draft && row && typeof row === "object") {
    metadataDrafts.delete(row);
    if (value !== null && !newKey) {
      const blankRow = forms[index];
      if (blankRow && typeof blankRow === "object") metadataDrafts.set(blankRow, draft);
    }
  }
  entry[field] = forms;
  writes.forEach((write) => write());
  if (value === null) {
    renderEntryForm();
    markChanged();
  } else {
    updateEntryFromForm();
  }
}

function handleAddVariant() {
  addMetadataParent("variant");
}

function handleRemoveVariant(index: number) {
  const error = updateMetadataParent("variant", index, null);
  if (error) alert(error);
}

function handleVariantChange(index: number, value: string) {
  return updateMetadataParent("variant", index, value);
}

function handleAddPhonetic() {
  addMetadataParent("phonetic");
}

function handleRemovePhonetic(index: number) {
  const error = updateMetadataParent("phonetic", index, null);
  if (error) alert(error);
}

function handlePhoneticChange(index: number, value: string) {
  return updateMetadataParent("phonetic", index, value);
}

function handleAddNote() {
  if (!selectedEntry) return;
  const notes = toElanTextArray(selectedEntry.note);
  notes.push("");
  setNoteArray(selectedEntry, notes);
  renderEntryForm();
  markChanged();
}

function handleRemoveNote(index: number) {
  if (!selectedEntry || !selectedEntry.note) return;
  const notes = toElanTextArray(selectedEntry.note);
  notes.splice(index, 1);
  setNoteArray(selectedEntry, notes);
  renderEntryForm();
  markChanged();
}

function handleNoteChange(index: number, value: string) {
  if (!selectedEntry) return;
  const notes = toElanTextArray(selectedEntry.note);
  setElanTextAt(notes, index, value);
  setNoteArray(selectedEntry, notes);
  updateEntryFromForm();
}

function handleSenseFieldChange(senseIndex: number, field: string, valIdx: number, value: string) {
  if (!selectedEntry?.sense || !selectedEntry.sense[senseIndex]) return;
  const sense = selectedEntry.sense[senseIndex];
  const values = toElanTextArray(sense[field]);
  setElanTextAt(values, valIdx, value);
  sense[field] = values;
  updateEntryFromForm();
}

function handleRemoveSenseField(senseIndex: number, field: string, valIdx: number) {
  if (!selectedEntry?.sense || !selectedEntry.sense[senseIndex]) return;
  const sense = selectedEntry.sense[senseIndex];
  const values = toElanTextArray(sense[field]);
  values.splice(valIdx, 1);
  sense[field] = values.length > 0 ? values : null;
  renderEntryForm();
  markChanged();
}

function handleAddSenseField(senseIndex: number, field: string) {
  if (!selectedEntry?.sense || !selectedEntry.sense[senseIndex]) return;
  const sense = selectedEntry.sense[senseIndex];
  const values = toElanTextArray(sense[field]);
  values.push("");
  sense[field] = values;
  renderEntryForm();
  markChanged();
}

function handleAddSense() {
  if (!selectedEntry) return;
  const order = selectedEntry.sense
    ? String(selectedEntry.sense.length + 1)
    : "1";
  const newSense: LexiconSense = {
    $: {
      id: `s_${(window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
        Math.random().toString(36).slice(2)
        }`,
      order,
    },
    "grammatical-category": [""],
    gloss: [""],
  };
  if (!selectedEntry.sense) selectedEntry.sense = [];
  selectedEntry.sense.push(newSense);
  renderEntryForm();
  markChanged();
}

function updateEntryFromForm() {
  if (!selectedEntry || !refs.entryDetails) return;

  const lexicalUnitInput = refs.lexicalUnitInput as HTMLInputElement;
  const morphTypeInput = refs.morphTypeInput as HTMLInputElement;

  setFirstElanText(selectedEntry, "lexical-unit", lexicalUnitInput.value);
  setFirstElanText(selectedEntry, "morph-type", morphTypeInput.value);

  // Update custom entry fields (standard and field@name) not tied to senses
  refs.entryDetails
    .querySelectorAll<HTMLInputElement>(".custom-field-input:not([data-sense-index])")
    .forEach((input) => {
      const fieldName = input.dataset.fieldName;
      if (!fieldName) return;

      if (fieldName === "field") {
        const nameAttr = input.dataset.customName;
        if (!nameAttr) return;
        const existingIdx = findNamedElanFieldIndex(
          getFieldArray(selectedEntry!.field),
          nameAttr
        );
        if (input.value || existingIdx >= 0) {
          setNamedFieldText(selectedEntry!, nameAttr, input.value);
        }
      } else {
        setFirstElanText(selectedEntry!, fieldName, input.value);
      }
    });

  // Update senses from DOM
  const senseEls = refs.sensesContainer!.querySelectorAll(".sense-section");
  senseEls.forEach((senseEl, index) => {
    if (!selectedEntry?.sense) return;
    const gci = senseEl.querySelector(".grammatical-category") as HTMLInputElement;
    if (!selectedEntry.sense[index]) return;
    setFirstElanText(
      selectedEntry.sense[index],
      "grammatical-category",
      gci ? gci.value : ""
    );

    // Custom sense fields
    senseEl
      .querySelectorAll<HTMLInputElement>(".custom-field-input[data-sense-index]")
      .forEach((input) => {
        const fieldName = input.dataset.fieldName;
        if (!fieldName) return;
        if (!selectedEntry?.sense || !selectedEntry.sense[index]) return;

        if (fieldName === "field") {
          const nameAttr = input.dataset.customName;
          if (!nameAttr) return;
          const target = selectedEntry.sense[index];
          const existingIdx = findNamedElanFieldIndex(
            getFieldArray(target.field),
            nameAttr
          );
          if (input.value || existingIdx >= 0) {
            setNamedFieldText(target, nameAttr, input.value);
          }
        } else {
          setFirstElanText(
            selectedEntry.sense[index],
            fieldName,
            input.value
          );
        }
      });
  });

  // Update the heading when lexical unit changes
  updateEntryHeading();
  markChanged();
  scheduleAutocompleteRefresh();
}

function parseRecordList(rawValue: string, desc: RecordListDescriptor): Record<string, string>[] {
  if (!rawValue || !rawValue.trim()) return [];
  const recordStrings = rawValue.split(desc.recordSeparator).map((s) => s.trim());
  const rows: Record<string, string>[] = [];

  for (const recordStr of recordStrings) {
    let inner = recordStr;
    const open = desc.recordDelimiters[0];
    const close = desc.recordDelimiters[1];
    if (inner.startsWith(open)) inner = inner.slice(open.length);
    if (inner.endsWith(close)) inner = inner.slice(0, -close.length);
    inner = inner.trim();

    const pairs: Record<string, string> = {};
    for (let i = 0; i < desc.keyOrder.length; i++) {
      const key = desc.keyOrder[i];
      const prefix = key + desc.kvSeparator;
      const startIdx = inner.indexOf(prefix);
      if (startIdx === -1) {
        pairs[key] = "";
        continue;
      }
      const valueStart = startIdx + prefix.length;
      if (i + 1 < desc.keyOrder.length) {
        const nextPrefix = desc.keyOrder[i + 1] + desc.kvSeparator;
        const endIdx = inner.indexOf(nextPrefix, valueStart);
        if (endIdx === -1) {
          pairs[key] = inner.slice(valueStart).trim();
        } else {
          pairs[key] = inner.slice(valueStart, endIdx).trim();
        }
      } else {
        pairs[key] = inner.slice(valueStart).trim();
      }
    }
    rows.push(pairs);
  }
  return rows;
}

function parseKeyedListRecord(raw: string, desc: KeyedListDescriptor): KeyedPair | null {
  let inner = raw.trim();
  const [open, close] = desc.recordDelimiters;
  if (open && inner.startsWith(open)) inner = inner.slice(open.length);
  if (close && inner.endsWith(close)) inner = inner.slice(0, -close.length);
  if (!desc.kvSeparator) return null;

  const sepIdx = inner.indexOf(desc.kvSeparator);
  if (sepIdx === -1) return null;
  return {
    key: inner.slice(0, sepIdx).trim(),
    value: inner.slice(sepIdx + desc.kvSeparator.length).trim(),
  };
}

function parseKeyedList(rawValue: string, desc: KeyedListDescriptor): KeyedPair[] {
  if (!rawValue.trim()) return [];
  const rows: KeyedPair[] = [];
  for (const raw of rawValue.split(desc.recordSeparator)) {
    const pair = parseKeyedListRecord(raw, desc);
    if (pair) rows.push(pair);
  }
  return rows;
}

function renderRecordListTable(rawValue: string, desc: RecordListDescriptor): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "parser-field-wrapper";

  const rows = parseRecordList(rawValue, desc);
  if (rows.length === 0) {
    const placeholder = document.createElement("p");
    placeholder.className = "parser-no-data";
    placeholder.textContent = "No data";
    wrapper.appendChild(placeholder);
    return wrapper;
  }

  const table = document.createElement("table");
  table.className = "parser-table";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const key of desc.keyOrder) {
    const th = document.createElement("th");
    th.textContent = (desc.columnLabels && desc.columnLabels[key]) || key;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  let lastGroupValue: string | null = null;
  for (const row of rows) {
    const tr = document.createElement("tr");
    if (desc.groupBy) {
      const groupValue = row[desc.groupBy] || "";
      if (groupValue !== lastGroupValue) {
        tr.className = "parser-group-start";
        lastGroupValue = groupValue;
      }
    }
    for (const key of desc.keyOrder) {
      const td = document.createElement("td");
      td.textContent = row[key] || "";
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrapper.appendChild(table);
  return wrapper;
}

function renderKeyedListTable(rawValue: string, desc: KeyedListDescriptor): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "parser-field-wrapper";

  const rows = parseKeyedList(rawValue, desc);
  if (rows.length === 0) {
    const placeholder = document.createElement("p");
    placeholder.className = "parser-no-data";
    placeholder.textContent = "No data";
    wrapper.appendChild(placeholder);
    return wrapper;
  }

  const table = document.createElement("table");
  table.className = "parser-table";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const thKey = document.createElement("th");
  thKey.textContent = desc.keyLabel;
  const thValue = document.createElement("th");
  thValue.textContent = desc.valueLabel;
  headerRow.appendChild(thKey);
  headerRow.appendChild(thValue);
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    const tdKey = document.createElement("td");
    tdKey.textContent = row.key;
    const tdValue = document.createElement("td");
    tdValue.textContent = row.value;
    tr.appendChild(tdKey);
    tr.appendChild(tdValue);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrapper.appendChild(table);
  return wrapper;
}

function renderParsedField(fieldName: string, rawValue: string): HTMLElement | null {
  if (!viewConfig || !viewConfig.parsers) return null;
  const desc = viewConfig.parsers[fieldName];
  if (!desc) return null;

  if (desc.type === "record-list") {
    return renderRecordListTable(rawValue, desc);
  } else if (desc.type === "keyed-list") {
    return renderKeyedListTable(rawValue, desc);
  }
  return null;
}

function applyFieldGroups(container: HTMLElement) {
  if (!viewConfig || !viewConfig["field-groups"]) return;
  for (const group of viewConfig["field-groups"]) {
    if (!group.fields || group.fields.length === 0) continue;
    const matched: HTMLElement[] = [];
    for (const name of group.fields) {
      const el = container.querySelector<HTMLElement>(
        `[data-field-name="${CSS.escape(name)}"]`
      );
      if (el) matched.push(el);
    }
    if (matched.length === 0) continue;

    const details = document.createElement("details");
    if (!group.collapsedByDefault) details.open = true;
    details.className = "field-group-details";

    const summary = document.createElement("summary");
    summary.textContent = group.label;
    details.appendChild(summary);

    container.insertBefore(details, matched[0]);
    matched.forEach((el) => details.appendChild(el));
  }
}

function renderCustomEntryFields() {
  const lexicon = getLexicon ? getLexicon() : null;
  if (!lexicon || !lexicon.header || !selectedEntry || !refs.entryDetails)
    return;

  const container =
    (refs.entryCustomFieldsContainer as HTMLElement) || refs.entryDetails;
  if (!container) return;
  container.innerHTML = "";

  const header = Array.isArray(lexicon.header)
    ? lexicon.header[0]
    : lexicon.header;
  if (!header["custom-fields"] || !header["custom-fields"][0]) return;

  const customFieldsContainer = header["custom-fields"][0];
  let customFields: any[] = [];

  if (Array.isArray(customFieldsContainer["field-spec"])) {
    customFields = customFieldsContainer["field-spec"].filter(
      (f: any) => f && f.$ && f.$.level === "entry"
    );
  } else if (
    customFieldsContainer["field-spec"] &&
    customFieldsContainer["field-spec"].$ &&
    customFieldsContainer["field-spec"].$.level === "entry"
  ) {
    customFields = [customFieldsContainer["field-spec"]];
  }

  const getEntryValue = (fieldName: string, customName?: string) => {
    if (!selectedEntry) return "";
    if (fieldName === "field" && customName) {
      return getNamedFieldText(selectedEntry.field, customName);
    }
    const val = selectedEntry[fieldName];
    return getFirstElanText(val);
  };

  const isAttachedField = (name: string): boolean => {
    if (!viewConfig || !viewConfig.parsers) return false;
    const desc = viewConfig.parsers[name];
    return !!(desc && desc.type === "keyed-list" && desc.attachTo);
  };

  const appendField = (
    displayName: string,
    fieldName: string,
    value: string,
    customName?: string
  ) => {
    if (isAttachedField(displayName)) return;

    const id = `custom_${displayName}`;
    const existing = container.querySelector(`#custom_${CSS.escape(displayName)}`);
    if (existing) return;

    const formGroup = document.createElement("div");
    formGroup.className = "form-group custom-field-group";
    formGroup.dataset.fieldName = displayName;

    const label = document.createElement("label");
    label.textContent = displayName.replace(/_/g, " ");

    const parsed = renderParsedField(displayName, value);
    if (parsed) {
      formGroup.appendChild(label);
      formGroup.appendChild(parsed);
    } else {
      const input = document.createElement("input");
      input.type = "text";
      input.id = id;
      input.className = "custom-field-input";
      input.dataset.fieldName = fieldName;
      if (customName) input.dataset.customName = customName;
      input.value = value || "";
      input.oninput = () => updateEntryFromForm();

      formGroup.appendChild(label);
      formGroup.appendChild(input);
    }
    container.appendChild(formGroup);
  };

  customFields.forEach((field) => {
    if (!field || !field.$) return;
    const fieldName = field.$.name;
    if (!fieldName) return;

    const binding = resolveDeclaredElanField(selectedEntry!, field.$);
    appendField(binding.name, binding.fieldName, binding.value, binding.customName);
  });

  const standardFields = ["$", "lexical-unit", "morph-type", "phonetic", "note", "sense", "variant"];
  Object.keys(selectedEntry).forEach((key) => {
    if (standardFields.includes(key)) return;
    if (key === "field") return;
    const isDefined = customFields.some((f) => f.$.name === key);
    if (isDefined) return;
    appendField(key, key, getEntryValue(key));
  });

  if (selectedEntry.field) {
    const fieldElements = getFieldArray(selectedEntry.field);
    fieldElements.forEach((field: any) => {
      if (!field || !field.$ || !field.$.name) return;
      const fieldName = field.$.name;
      const isDefined = customFields.some(
        (f) =>
          f.$.name === fieldName ||
          (f.$.name === "field" && ((f.$ && f.$.nameAttr) || f.$.name) === fieldName)
      );
      if (isDefined) return;
      appendField(fieldName, "field", getElanText(field), fieldName);
    });
  }

  applyFieldGroups(container);
}

function renderCustomSenseFields(
  sense: LexiconSense,
  senseSection: HTMLElement,
  senseIndex: number
) {
  const lexicon = getLexicon ? getLexicon() : null;
  if (!lexicon || !lexicon.header) return;
  const header = Array.isArray(lexicon.header)
    ? lexicon.header[0]
    : lexicon.header;
  if (!header["custom-fields"] || !header["custom-fields"][0]) return;
  const customFieldsContainer = header["custom-fields"][0];
  let customFields: any[] = [];

  if (Array.isArray(customFieldsContainer["field-spec"])) {
    customFields = customFieldsContainer["field-spec"].filter(
      (f: any) => f && f.$ && f.$.level === "sense"
    );
  } else if (
    customFieldsContainer["field-spec"] &&
    customFieldsContainer["field-spec"].$ &&
    customFieldsContainer["field-spec"].$.level === "sense"
  ) {
    customFields = [customFieldsContainer["field-spec"]];
  }

  customFields.forEach((field) => {
    if (!field || !field.$) return;
    const fieldName = field.$.name;
    if (!fieldName) return;
    if (fieldName === "definition") return;

    const formGroup = document.createElement("div");
    formGroup.className = "form-group custom-field-group";
    formGroup.dataset.fieldName = fieldName;

    const label = document.createElement("label");
    label.textContent = fieldName.replace(/_/g, " ");

    const input = document.createElement("input");
    input.type = "text";
    input.className = "custom-field-input";
    input.dataset.fieldName = fieldName;
    input.dataset.senseIndex = String(senseIndex);

    const binding = resolveDeclaredElanField(sense, field.$);
    formGroup.dataset.fieldName = binding.name;
    label.textContent = binding.name.replace(/_/g, " ");
    input.dataset.fieldName = binding.fieldName;
    if (binding.customName) input.dataset.customName = binding.customName;
    input.value = binding.value;
    input.oninput = () => updateEntryFromForm();

    formGroup.appendChild(label);
    formGroup.appendChild(input);
    senseSection.appendChild(formGroup);
  });

  // Add ad-hoc fields on sense not in header
  const standardFields = ["$", "grammatical-category", "gloss", "definition", "comment", "internal-note"];
  Object.keys(sense).forEach((key) => {
    if (standardFields.includes(key)) return;
    if (key === "field") return;
    const isDefined = customFields.some((f) => f.$.name === key);
    if (isDefined) return;

    const formGroup = document.createElement("div");
    formGroup.className = "form-group custom-field-group";
    formGroup.dataset.fieldName = key;

    const label = document.createElement("label");
    label.textContent = key.replace(/_/g, " ");

    const input = document.createElement("input");
    input.type = "text";
    input.className = "custom-field-input";
    input.dataset.fieldName = key;
    input.dataset.senseIndex = String(senseIndex);
    input.value = getFirstElanText(sense[key]);
    input.oninput = () => updateEntryFromForm();

    formGroup.appendChild(label);
    formGroup.appendChild(input);
    senseSection.appendChild(formGroup);
  });

  // field@name on sense
  if (sense.field) {
    const fieldElements = Array.isArray(sense.field)
      ? sense.field
      : [sense.field];
    fieldElements.forEach((field: any) => {
      if (!field || !field.$ || !field.$.name) return;
      const fieldName = field.$.name;
      if (fieldName === "definition") return;
      const isDefined = customFields.some(
        (f) =>
          f.$.name === fieldName ||
          (f.$.name === "field" && ((f.$ && f.$.nameAttr) || f.$.name) === fieldName)
      );
      if (isDefined) return;

      const formGroup = document.createElement("div");
      formGroup.className = "form-group custom-field-group";
      formGroup.dataset.fieldName = fieldName;

      const label = document.createElement("label");
      label.textContent = fieldName.replace(/_/g, " ");

      const input = document.createElement("input");
      input.type = "text";
      input.className = "custom-field-input";
      input.dataset.fieldName = "field";
      input.dataset.customName = fieldName;
      input.dataset.senseIndex = String(senseIndex);
      input.value = getElanText(field);
      input.oninput = () => updateEntryFromForm();

      formGroup.appendChild(label);
      formGroup.appendChild(input);
      senseSection.appendChild(formGroup);
    });
  }
}

function buildSenseSummary(sense: LexiconSense) {
  const grammaticalCategory = getFirstElanText(sense["grammatical-category"]);
  const gloss = getFirstElanText(sense.gloss);

  const parts = [grammaticalCategory, gloss]
    .map((p) => (p || "").toString().trim())
    .filter((p) => p.length > 0);

  return parts.length ? parts.join(" — ") : "No details";
}

function renderEntryForm() {
  if (!selectedEntry) {
    if (refs.emptySelection) refs.emptySelection.classList.remove("hidden");
    if (refs.entryDetails) refs.entryDetails.classList.add("hidden");
    if (refs.entryHeaderBar) refs.entryHeaderBar.classList.add("hidden");
    return;
  }

  if (refs.emptySelection) refs.emptySelection.classList.add("hidden");
  if (refs.entryDetails) refs.entryDetails.classList.remove("hidden");
  if (refs.entryHeaderBar) refs.entryHeaderBar.classList.remove("hidden");

  refreshAutocompleteOptions();

  // Standard fields
  (refs.lexicalUnitInput as HTMLInputElement).value =
    getFirstElanText(selectedEntry["lexical-unit"]);
  (refs.morphTypeInput as HTMLInputElement).value =
    getFirstElanText(selectedEntry["morph-type"]);
  attachAutocomplete(
    refs.morphTypeInput as HTMLInputElement,
    AUTOCOMPLETE_IDS.morphType
  );
  (refs.entryIdInput as HTMLInputElement).value =
    (selectedEntry.$ && selectedEntry.$.id) || "";
  (refs.dateCreatedInput as HTMLInputElement).value =
    (selectedEntry.$ && selectedEntry.$.dateCreated) || "";
  (refs.dateModifiedInput as HTMLInputElement).value =
    (selectedEntry.$ && selectedEntry.$.dateModified) || "";

  // Use input event for immediate updates
  refs.lexicalUnitInput!.oninput = updateEntryFromForm;
  refs.morphTypeInput!.oninput = updateEntryFromForm;

  // Variants
  if (refs.variantsContainer) {
    fillMultiFieldContainer(
      refs.variantsContainer,
      selectedEntry.variant,
      "variant-input",
      "variant-group",
      handleVariantChange,
      handleRemoveVariant,
      undefined,
      "variant"
    );
  }

  // Phonetic
  if (refs.phoneticContainer) {
    fillMultiFieldContainer(
      refs.phoneticContainer,
      selectedEntry.phonetic,
      "phonetic-input",
      "phonetic-group",
      handlePhoneticChange,
      handleRemovePhonetic,
      undefined,
      "phonetic"
    );
  }

  // Note
  if (refs.noteContainer) {
    fillMultiFieldContainer(
      refs.noteContainer,
      selectedEntry.note,
      "note-input",
      "note-group",
      handleNoteChange,
      handleRemoveNote
    );
  }

  // Senses
  if (refs.sensesContainer) refs.sensesContainer.innerHTML = "";
  (selectedEntry.sense || []).forEach((sense, index) => {
    const senseSection = document.createElement("div");
    senseSection.className = "sense-section";

    const senseHeader = document.createElement("div");
    senseHeader.className = "sense-header";
    senseHeader.tabIndex = 0;
    senseHeader.setAttribute("role", "button");

    const headerLeft = document.createElement("div");
    headerLeft.className = "sense-header-left";

    const badge = document.createElement("span");
    badge.className = "sense-badge";
    badge.textContent = `Sense ${index + 1}`;

    const summary = document.createElement("span");
    summary.className = "sense-summary";
    summary.textContent = buildSenseSummary(sense);

    headerLeft.appendChild(badge);
    headerLeft.appendChild(summary);

    const headerActions = document.createElement("div");
    headerActions.className = "sense-actions";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.className = "button danger small sense-remove-btn";
    removeButton.disabled = (selectedEntry!.sense || []).length <= 1;
    removeButton.onclick = () => {
      selectedEntry!.sense = (selectedEntry!.sense || []).filter(
        (_, i) => i !== index
      );
      renderEntryForm();
      markChanged();
    };

    headerActions.appendChild(removeButton);
    senseHeader.appendChild(headerLeft);
    senseHeader.appendChild(headerActions);

    const senseBody = document.createElement("div");
    senseBody.className = "sense-body";

    const expandedByDefault = index === 0;
    if (!expandedByDefault) {
      senseBody.hidden = true;
      senseHeader.classList.add("collapsed");
      senseHeader.setAttribute("aria-expanded", "false");
    } else {
      senseHeader.setAttribute("aria-expanded", "true");
    }

    const toggleSense = () => {
      const isHidden = senseBody.hidden;
      senseBody.hidden = !isHidden;
      senseHeader.classList.toggle("collapsed", !isHidden);
      senseHeader.setAttribute(
        "aria-expanded",
        isHidden ? "true" : "false"
      );
    };

    senseHeader.addEventListener("click", (e) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest(".sense-remove-btn")) return;
      toggleSense();
    });
    senseHeader.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleSense();
      }
    });

    const senseIdGroup = document.createElement("div");
    senseIdGroup.className = "form-group";
    const senseIdLabel = document.createElement("label");
    senseIdLabel.textContent = "ID";
    const senseIdInput = document.createElement("input");
    senseIdInput.type = "text";
    senseIdInput.value = (sense.$ && sense.$.id) || "";
    senseIdInput.disabled = true;
    senseIdGroup.appendChild(senseIdLabel);
    senseIdGroup.appendChild(senseIdInput);

    const grammaticalCategoryGroup = document.createElement("div");
    grammaticalCategoryGroup.className = "form-group";
    const grammaticalCategoryLabel = document.createElement("label");
    grammaticalCategoryLabel.textContent = "Gram. Category";
    grammaticalCategoryLabel.title = "Grammatical Category";
    const grammaticalCategoryInput = document.createElement("input");
    grammaticalCategoryInput.type = "text";
    grammaticalCategoryInput.className = "grammatical-category";
    grammaticalCategoryInput.value =
      getFirstElanText(sense["grammatical-category"]);
    attachAutocomplete(
      grammaticalCategoryInput,
      AUTOCOMPLETE_IDS.grammaticalCategory
    );
    grammaticalCategoryInput.oninput = updateEntryFromForm;
    grammaticalCategoryGroup.appendChild(grammaticalCategoryLabel);
    grammaticalCategoryGroup.appendChild(grammaticalCategoryInput);
    senseBody.appendChild(grammaticalCategoryGroup);

    // Gloss (XSD: minOccurs=1, maxOccurs=unbounded)
    appendMultiFieldSection(
      senseBody,
      "Gloss",
      "gloss",
      sense.gloss,
      (valIdx, value) => handleSenseFieldChange(index, "gloss", valIdx, value),
      (valIdx) => handleRemoveSenseField(index, "gloss", valIdx),
      () => handleAddSenseField(index, "gloss"),
      1
    );

    // Definition (XSD: minOccurs=0, maxOccurs=unbounded)
    appendMultiFieldSection(
      senseBody,
      "Definition",
      "definition",
      (sense as any)["definition"],
      (valIdx, value) => handleSenseFieldChange(index, "definition", valIdx, value),
      (valIdx) => handleRemoveSenseField(index, "definition", valIdx),
      () => handleAddSenseField(index, "definition"),
      undefined,
      undefined,
      true
    );

    // Comment (XSD: minOccurs=0, maxOccurs=unbounded)
    appendMultiFieldSection(
      senseBody,
      "Comment",
      "comment",
      (sense as any)["comment"],
      (valIdx, value) => handleSenseFieldChange(index, "comment", valIdx, value),
      (valIdx) => handleRemoveSenseField(index, "comment", valIdx),
      () => handleAddSenseField(index, "comment"),
      undefined,
      undefined,
      true
    );

    // Internal Note (XSD: minOccurs=0, maxOccurs=unbounded)
    appendMultiFieldSection(
      senseBody,
      "Internal Note",
      "internal-note",
      (sense as any)["internal-note"],
      (valIdx, value) => handleSenseFieldChange(index, "internal-note", valIdx, value),
      (valIdx) => handleRemoveSenseField(index, "internal-note", valIdx),
      () => handleAddSenseField(index, "internal-note"),
      undefined,
      undefined,
      true
    );

    // Custom sense-level fields
    renderCustomSenseFields(sense, senseBody, index);

    // Sense metadata at the bottom
    senseBody.appendChild(senseIdGroup);

    senseSection.appendChild(senseHeader);
    senseSection.appendChild(senseBody);

    refs.sensesContainer!.appendChild(senseSection);
  });

  // Custom entry-level fields after base sections
  renderCustomEntryFields();

  // Update the heading to show the lexical unit
  updateEntryHeading();
}

export function load(entry: LexiconEntry | null) {
  selectedEntry = entry || null;
  if (!selectedEntry) {
    clear();
    return;
  }

  // Deep copy for discard functionality
  originalEntry = JSON.stringify(selectedEntry);

  // Reset status UI
  const hasDraft = hasMetadataDraft(selectedEntry);
  if (refs.entryStatus) {
    refs.entryStatus.textContent = hasDraft ? "Modified" : "No changes";
    refs.entryStatus.classList.toggle("modified", hasDraft);
  }
  if (refs.discardChangesBtn) {
    (refs.discardChangesBtn as HTMLButtonElement).disabled = !hasDraft;
  }

  renderEntryForm();
}
