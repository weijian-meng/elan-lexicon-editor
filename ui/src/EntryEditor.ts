// Entry Editor Module

import {
  findNamedElanFieldIndex,
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

function setVariantArray(entry: LexiconEntry, variants: any[]) {
  entry.variant = variants;
}

function setPhoneticArray(entry: LexiconEntry, phonetics: any[]) {
  entry.phonetic = phonetics;
}

function setNoteArray(entry: LexiconEntry, notes: any[]) {
  if (notes.length > 0) {
    entry.note = notes;
  } else {
    entry.note = null;
  }
}

function fillMultiFieldContainer(
  container: HTMLElement,
  values: any,
  inputClassName: string,
  groupClassName: string,
  onChange: (index: number, value: string) => void,
  onRemove: (index: number) => void,
  minItems?: number
): void {
  container.innerHTML = "";
  const items = toElanTextArray(values);
  items.forEach((item, index) => {
    const group = document.createElement("div");
    group.className = groupClassName;

    const input = document.createElement("input");
    input.type = "text";
    input.value = getElanText(item);
    input.className = inputClassName;
    input.oninput = (e) =>
      onChange(index, (e.target as HTMLInputElement).value);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.className = "button danger small";
    if (minItems && items.length <= minItems) {
      removeButton.disabled = true;
    }
    removeButton.onclick = () => onRemove(index);

    group.appendChild(input);
    group.appendChild(removeButton);
    container.appendChild(group);
  });
}

function appendMultiFieldSection(
  parent: HTMLElement,
  label: string,
  fieldKey: string,
  values: any,
  onChange: (index: number, value: string) => void,
  onRemove: (index: number) => void,
  onAdd: () => void,
  minItems?: number
): void {
  const section = document.createElement("div");
  section.className = `${fieldKey}-section`;

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
    minItems
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

function markChanged() {
  console.log("EntryEditor: markChanged called");
  if (selectedEntry && selectedEntry.$) {
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

function handleAddVariant() {
  if (!selectedEntry) return;
  const variants = toElanTextArray(selectedEntry.variant);
  variants.push("");
  setVariantArray(selectedEntry, variants);
  renderEntryForm();
  markChanged();
}

function handleRemoveVariant(index: number) {
  if (!selectedEntry || !selectedEntry.variant) return;
  const variants = toElanTextArray(selectedEntry.variant);
  variants.splice(index, 1);
  setVariantArray(selectedEntry, variants);
  renderEntryForm();
  markChanged();
}

function handleVariantChange(index: number, value: string) {
  if (!selectedEntry) return;
  const variants = toElanTextArray(selectedEntry.variant);
  setElanTextAt(variants, index, value);
  setVariantArray(selectedEntry, variants);
  updateEntryFromForm();
}

function handleAddPhonetic() {
  if (!selectedEntry) return;
  const phonetics = toElanTextArray(selectedEntry.phonetic);
  phonetics.push("");
  setPhoneticArray(selectedEntry, phonetics);
  renderEntryForm();
  markChanged();
}

function handleRemovePhonetic(index: number) {
  if (!selectedEntry || !selectedEntry.phonetic) return;
  const phonetics = toElanTextArray(selectedEntry.phonetic);
  phonetics.splice(index, 1);
  setPhoneticArray(selectedEntry, phonetics);
  renderEntryForm();
  markChanged();
}

function handlePhoneticChange(index: number, value: string) {
  if (!selectedEntry) return;
  const phonetics = toElanTextArray(selectedEntry.phonetic);
  setElanTextAt(phonetics, index, value);
  setPhoneticArray(selectedEntry, phonetics);
  updateEntryFromForm();
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
  refreshAutocompleteOptions();
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

  const appendField = (
    displayName: string,
    fieldName: string,
    value: string,
    customName?: string
  ) => {
    const id = `custom_${displayName}`;
    const existing = container.querySelector(`#${id}`);
    if (existing) return;

    const formGroup = document.createElement("div");
    formGroup.className = "form-group custom-field-group";
    formGroup.dataset.fieldName = displayName;

    const label = document.createElement("label");
    label.textContent = displayName.replace(/_/g, " ");

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
    container.appendChild(formGroup);
  };

  customFields.forEach((field) => {
    if (!field || !field.$) return;
    const fieldName = field.$.name;
    if (!fieldName) return;

    if (fieldName === "field") {
      const customName = (field.$ && field.$.nameAttr) || field.$.name;
      const displayName = customName || fieldName;
      appendField(
        displayName,
        "field",
        getEntryValue("field", displayName),
        displayName
      );
      return;
    }

    appendField(fieldName, "field", getEntryValue("field", fieldName), fieldName);
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

    const customName =
      fieldName === "field"
        ? (field.$ && field.$.nameAttr) || field.$.name
        : fieldName;
    input.dataset.fieldName = "field";
    input.dataset.customName = customName;
    input.value = getNamedFieldText(sense.field, customName);
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
      handleRemoveVariant
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
      handleRemovePhonetic
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
      () => handleAddSenseField(index, "definition")
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
  if (refs.entryStatus) {
    refs.entryStatus.textContent = "No changes";
    refs.entryStatus.classList.remove("modified");
  }
  if (refs.discardChangesBtn) {
    (refs.discardChangesBtn as HTMLButtonElement).disabled = true;
  }

  renderEntryForm();
}
