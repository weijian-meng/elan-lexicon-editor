// Entry Editor Module

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
    const fieldVal = entry[fieldName];
    if (Array.isArray(fieldVal)) {
      fieldVal.forEach((v: any) => {
        const text = typeof v === "string" ? v : (v && v._) || "";
        const normalized = text.trim();
        if (normalized) values.add(normalized);
      });
    } else if (typeof fieldVal === "string") {
      const normalized = fieldVal.trim();
      if (normalized) values.add(normalized);
    }
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
      const fieldVal = sense[fieldName];
      if (Array.isArray(fieldVal)) {
        fieldVal.forEach((v: any) => {
          const text = typeof v === "string" ? v : (v && v._) || "";
          const normalized = text.trim();
          if (normalized) values.add(normalized);
        });
      } else if (typeof fieldVal === "string") {
        const normalized = fieldVal.trim();
        if (normalized) values.add(normalized);
      }
    });
  });
  return Array.from(values).sort((a, b) => a.localeCompare(b));
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
  refs.entryCustomFieldsContainer = $("entryCustomFieldsContainer");
  refs.entryHeader = $("entryHeaderTitle");
  refs.entryHeaderBar = $("entryHeaderBar");
  refs.entryStatus = $("entryStatus");
  refs.discardChangesBtn = $("discardChangesBtn");

  if (refs.addSenseBtn) refs.addSenseBtn.onclick = handleAddSense;
  if (refs.addVariantBtn) refs.addVariantBtn.onclick = handleAddVariant;
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

  const lexicalUnit =
    (selectedEntry["lexical-unit"] && selectedEntry["lexical-unit"][0]) || "";
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
}

function handleAddVariant() {
  if (!selectedEntry) return;
  if (!selectedEntry.variant) selectedEntry.variant = [];
  selectedEntry.variant.push("");
  renderEntryForm();
  markChanged();
}

function handleRemoveVariant(index: number) {
  if (!selectedEntry || !selectedEntry.variant) return;
  selectedEntry.variant.splice(index, 1);
  renderEntryForm();
  markChanged();
}

function handleVariantChange(index: number, value: string) {
  if (!selectedEntry) return;
  if (!selectedEntry.variant) selectedEntry.variant = [];
  selectedEntry.variant[index] = value;
  updateEntryFromForm();
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

  selectedEntry["lexical-unit"] = [lexicalUnitInput.value];
  selectedEntry["morph-type"] = [morphTypeInput.value];

  // Update custom entry fields (standard and field@name) not tied to senses
  refs.entryDetails
    .querySelectorAll<HTMLInputElement>(".custom-field-input:not([data-sense-index])")
    .forEach((input) => {
      const fieldName = input.dataset.fieldName;
      if (!fieldName) return;

      if (fieldName === "field") {
        const nameAttr = input.dataset.customName;
        if (!nameAttr) return;
        if (!Array.isArray(selectedEntry!.field)) selectedEntry!.field = [];
        let idx = selectedEntry!.field.findIndex(
          (f: any) => f && f.$ && f.$.name === nameAttr
        );
        if (idx >= 0) {
          selectedEntry!.field[idx]._ = input.value;
        } else {
          selectedEntry!.field.push({ $: { name: nameAttr }, _: input.value });
        }
      } else {
        selectedEntry![fieldName] = [input.value];
      }
    });

  // Update senses from DOM
  const senseEls = refs.sensesContainer!.querySelectorAll(".sense-section");
  senseEls.forEach((senseEl, index) => {
    if (!selectedEntry?.sense) return;
    const gci = senseEl.querySelector(".grammatical-category") as HTMLInputElement;
    const gi = senseEl.querySelector(".gloss") as HTMLInputElement;
    const di = senseEl.querySelector(".definition") as HTMLInputElement;
    if (!selectedEntry.sense[index]) return;
    selectedEntry.sense[index]["grammatical-category"] = [
      gci ? gci.value : "",
    ];
    selectedEntry.sense[index].gloss = [gi ? gi.value : ""];
    selectedEntry.sense[index]["definition"] = [di ? di.value : ""];

    // Custom sense fields
    senseEl
      .querySelectorAll<HTMLInputElement>(".custom-field-input[data-sense-index]")
      .forEach((input) => {
        const fieldName = input.dataset.fieldName;
        if (!fieldName) return;
        if (!selectedEntry?.sense || !selectedEntry.sense[index]) return;

        if (fieldName === "field") {
          const nameAttr = input.dataset.customName;
          if (!Array.isArray(selectedEntry.sense[index].field))
            selectedEntry.sense[index].field = [];
          const sIdx = selectedEntry.sense[index].field.findIndex(
            (f: any) => f && f.$ && f.$.name === nameAttr
          );
          if (sIdx >= 0) {
            selectedEntry.sense[index].field[sIdx]._ = input.value;
          } else {
            selectedEntry.sense[index].field.push({
              $: { name: nameAttr },
              _: input.value,
            });
          }
        } else {
          selectedEntry.sense[index][fieldName] = [input.value];
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

  const getFieldArray = (value: any) => {
    if (Array.isArray(value)) return value;
    if (value) return [value];
    return [];
  };

  const getEntryValue = (fieldName: string, customName?: string) => {
    if (!selectedEntry) return "";
    if (fieldName === "field" && customName) {
      const fields = getFieldArray(selectedEntry.field);
      const found = fields.find(
        (f: any) => f && f.$ && f.$.name === customName
      );
      return (found && found._) || "";
    }
    const val = selectedEntry[fieldName];
    if (Array.isArray(val)) return val[0] || "";
    if (typeof val === "string") return val;
    return "";
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

    appendField(fieldName, fieldName, getEntryValue(fieldName));
  });

  const standardFields = ["$", "lexical-unit", "morph-type", "sense", "variant"];
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
        (f) => f.$.name === "field" && ((f.$ && f.$.nameAttr) || f.$.name) === fieldName
      );
      if (isDefined) return;
      appendField(fieldName, "field", field._ || "", fieldName);
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

    if (fieldName === "field") {
      const customName = (field.$ && field.$.nameAttr) || field.$.name;
      input.dataset.fieldName = "field";
      input.dataset.customName = customName;
    }

    input.value =
      sense[fieldName] && sense[fieldName].length > 0
        ? sense[fieldName][0]
        : "";
    input.oninput = () => updateEntryFromForm();

    formGroup.appendChild(label);
    formGroup.appendChild(input);
    senseSection.appendChild(formGroup);
  });

  // Add ad-hoc fields on sense not in header
  const standardFields = ["$", "grammatical-category", "gloss", "definition"];
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
    input.value =
      sense[key] && sense[key].length > 0 ? sense[key][0] : "";
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
      const isDefined = customFields.some((f) => f.$.name === fieldName);
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
      input.value = field._ || "";
      input.oninput = () => updateEntryFromForm();

      formGroup.appendChild(label);
      formGroup.appendChild(input);
      senseSection.appendChild(formGroup);
    });
  }
}

function buildSenseSummary(sense: LexiconSense) {
  const grammaticalCategory =
    (sense["grammatical-category"] &&
      Array.isArray(sense["grammatical-category"]) &&
      sense["grammatical-category"][0]) ||
    "";
  const gloss =
    (sense.gloss && Array.isArray(sense.gloss) && sense.gloss[0]) || "";

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
    (selectedEntry["lexical-unit"] && selectedEntry["lexical-unit"][0]) || "";
  (refs.morphTypeInput as HTMLInputElement).value =
    (selectedEntry["morph-type"] && selectedEntry["morph-type"][0]) || "";
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
  if (refs.variantsContainer) refs.variantsContainer.innerHTML = "";
  if (selectedEntry.variant) {
    selectedEntry.variant.forEach((variant, index) => {
      const variantGroup = document.createElement("div");
      variantGroup.className = "variant-group";

      const variantInput = document.createElement("input");
      variantInput.type = "text";
      variantInput.value = variant;
      variantInput.className = "variant-input";
      variantInput.oninput = (e) =>
        handleVariantChange(index, (e.target as HTMLInputElement).value);

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.textContent = "Remove";
      removeButton.className = "button danger small";
      removeButton.onclick = () => handleRemoveVariant(index);

      variantGroup.appendChild(variantInput);
      variantGroup.appendChild(removeButton);
      refs.variantsContainer!.appendChild(variantGroup);
    });
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
      (sense["grammatical-category"] && sense["grammatical-category"][0]) ||
      "";
    attachAutocomplete(
      grammaticalCategoryInput,
      AUTOCOMPLETE_IDS.grammaticalCategory
    );
    grammaticalCategoryInput.oninput = updateEntryFromForm;
    grammaticalCategoryGroup.appendChild(grammaticalCategoryLabel);
    grammaticalCategoryGroup.appendChild(grammaticalCategoryInput);

    const glossGroup = document.createElement("div");
    glossGroup.className = "form-group";
    const glossLabel = document.createElement("label");
    glossLabel.textContent = "Gloss";
    const glossInput = document.createElement("input");
    glossInput.type = "text";
    glossInput.className = "gloss";
    glossInput.value = (sense.gloss && sense.gloss[0]) || "";
    glossInput.oninput = updateEntryFromForm;
    glossGroup.appendChild(glossLabel);
    glossGroup.appendChild(glossInput);

    const coreGrid = document.createElement("div");
    coreGrid.className = "sense-core-grid";
    coreGrid.appendChild(grammaticalCategoryGroup);
    coreGrid.appendChild(glossGroup);

    senseBody.appendChild(coreGrid);

    const definitionGroup = document.createElement("div");
    definitionGroup.className = "form-group";
    const definitionLabel = document.createElement("label");
    definitionLabel.textContent = "Definition";
    const definitionInput = document.createElement("input");
    definitionInput.type = "text";
    definitionInput.className = "definition";
    const definitionVal = (sense as any)["definition"];
    definitionInput.value = Array.isArray(definitionVal)
      ? definitionVal[0] || ""
      : definitionVal || "";
    definitionInput.oninput = updateEntryFromForm;
    definitionGroup.appendChild(definitionLabel);
    definitionGroup.appendChild(definitionInput);
    senseBody.appendChild(definitionGroup);

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
