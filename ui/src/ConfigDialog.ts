// Config dialog component for lexicon header, fields tree, and custom fields

import { LexiconEntry } from "./LexiconTable";

type LexiconHeader = {
  name?: string[];
  language?: string[];
  description?: string[];
  author?: string[];
  version?: string[];
  "sort-order"?: string[];
  "custom-fields"?: [{ "field-spec"?: any | any[] }];
  [key: string]: any;
};

type Lexicon = {
  header: LexiconHeader | LexiconHeader[];
  entry?: LexiconEntry[];
};

export interface ConfigDialogOptions {
  getLexicon: () => Lexicon | null;
  onChange: () => void;
}

let getLexicon: (() => Lexicon | null) | null = null;
let onChange: (() => void) | null = null;

// DOM refs
let dialogEl: HTMLElement | null = null,
  tabs: NodeListOf<HTMLElement> | null = null,
  sections: NodeListOf<HTMLElement> | null = null,
  fieldsTree: HTMLElement | null = null,
  customFieldsList: HTMLElement | null = null,
  addCustomFieldBtn: HTMLElement | null = null,
  cancelBtn: HTMLElement | null = null,
  saveBtn: HTMLElement | null = null;

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

export function init(options: ConfigDialogOptions) {
  getLexicon =
    options && typeof options.getLexicon === "function"
      ? options.getLexicon
      : null;
  onChange =
    options && typeof options.onChange === "function" ? options.onChange : null;

  dialogEl = $("configDialog");
  fieldsTree = $("fieldsTree");
  customFieldsList = $("customFieldsList");
  addCustomFieldBtn = $("addCustomFieldBtn");
  cancelBtn = $("cancelConfigBtn");
  saveBtn = $("saveConfigBtn");
  tabs = document.querySelectorAll(".config-tab");
  sections = document.querySelectorAll(".config-section");

  // Tabs
  if (tabs && sections) {
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.tab;
        tabs!.forEach((t) => t.classList.remove("active"));
        sections!.forEach((s) => s.classList.remove("active"));
        tab.classList.add("active");
        const section = document.getElementById(`${target}Section`);
        if (section) section.classList.add("active");
      });
    });
  }

  if (addCustomFieldBtn)
    addCustomFieldBtn.addEventListener("click", handleAddCustomField);
  if (cancelBtn) cancelBtn.addEventListener("click", hide);
  if (saveBtn) saveBtn.addEventListener("click", handleSaveConfig);
}

export function show() {
  const lexicon = getLexicon ? getLexicon() : null;
  if (!lexicon) {
    alert("Please create or open a lexicon first.");
    return;
  }

  const header = Array.isArray(lexicon.header)
    ? lexicon.header[0]
    : lexicon.header;
  if (!header) return;

  ($("configName") as HTMLInputElement).value =
    (header.name && header.name[0]) || "";
  ($("configLanguage") as HTMLInputElement).value =
    (header.language && header.language[0]) || "";
  ($("configDescription") as HTMLInputElement).value =
    (header.description && header.description[0]) || "";
  ($("configAuthor") as HTMLInputElement).value =
    (header.author && header.author[0]) || "";
  ($("configVersion") as HTMLInputElement).value =
    (header.version && header.version[0]) || "";

  renderFieldsTree(header);
  renderCustomFields(header);
  const sortOrderEl = $("sortOrder") as HTMLInputElement;
  if (sortOrderEl)
    sortOrderEl.value = (header["sort-order"] && header["sort-order"][0]) || "";

  if (dialogEl) dialogEl.classList.remove("hidden");
}

export function hide() {
  if (dialogEl) dialogEl.classList.add("hidden");
}

function renderFieldsTree(header: LexiconHeader) {
  if (!fieldsTree) return;
  fieldsTree.innerHTML = "";

  const entryNode = createTreeItem("entry", "root");
  fieldsTree.appendChild(entryNode);

  const entryFields = ["lexical-unit", "morph-type"];
  entryFields.forEach((f) => {
    const el = createTreeItem(f, "entry");
    entryNode.querySelector(".tree-item-children")!.appendChild(el);
  });

  const senseNode = createTreeItem("sense", "entry");
  entryNode.querySelector(".tree-item-children")!.appendChild(senseNode);
  const senseFields = ["grammatical-category", "gloss"];
  senseFields.forEach((f) => {
    const el = createTreeItem(f, "sense");
    senseNode.querySelector(".tree-item-children")!.appendChild(el);
  });

  if (header["custom-fields"] && header["custom-fields"][0]) {
    const container = header["custom-fields"][0];
    if (Array.isArray(container["field-spec"])) {
      container["field-spec"].forEach((field) => {
        if (field && field.$) {
          const el = createTreeItem(
            `${field.$.name} (custom)`,
            field.$.level || "entry"
          );
          if (field.$.level === "sense") {
            senseNode.querySelector(".tree-item-children")!.appendChild(el);
          } else {
            entryNode.querySelector(".tree-item-children")!.appendChild(el);
          }
        }
      });
    } else if (container["field-spec"] && container["field-spec"].$) {
      const field = container["field-spec"];
      const el = createTreeItem(
        `${field.$.name} (custom)`,
        field.$.level || "entry"
      );
      if (field.$.level === "sense") {
        senseNode.querySelector(".tree-item-children")!.appendChild(el);
      } else {
        entryNode.querySelector(".tree-item-children")!.appendChild(el);
      }
    }
  }
}

function createTreeItem(name: string, level: string) {
  const div = document.createElement("div");
  div.className = "tree-item";
  const content = document.createElement("div");
  content.className = "tree-item-content";
  const icon = document.createElement("span");
  icon.className = "tree-item-icon";
  icon.onclick = () => {
    const children = div.querySelector(
      ".tree-item-children"
    ) as HTMLElement | null;
    if (children) {
      children.style.display =
        children.style.display === "none" ? "block" : "none";
      icon.textContent = children.style.display === "none" ? "▶" : "▼";
    }
  };
  const label = document.createElement("span");
  label.className = "tree-item-label";
  label.textContent = name;
  content.appendChild(icon);
  content.appendChild(label);
  div.appendChild(content);
  if (level !== "leaf") {
    const children = document.createElement("div");
    children.className = "tree-item-children";
    div.appendChild(children);
  }
  return div;
}

function renderCustomFields(header: LexiconHeader) {
  if (!customFieldsList) return;
  customFieldsList.innerHTML = "";
  if (header["custom-fields"] && header["custom-fields"][0]) {
    const container = header["custom-fields"][0];
    if (Array.isArray(container["field-spec"])) {
      container["field-spec"].forEach((field) => {
        if (field && field.$)
          customFieldsList!.appendChild(
            createCustomFieldElement({
              name: field.$.name || "",
              level: field.$.level || "entry",
            })
          );
      });
    } else if (container["field-spec"] && container["field-spec"].$) {
      const field = container["field-spec"];
      customFieldsList.appendChild(
        createCustomFieldElement({
          name: field.$.name || "",
          level: field.$.level || "entry",
        })
      );
    }
  }
}

function createCustomFieldElement(field: { name: string; level: string }) {
  const div = document.createElement("div");
  div.className = "custom-field";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = field.name || "";
  nameInput.placeholder = "Field name";
  const levelSelect = document.createElement("select");
  levelSelect.innerHTML = `
      <option value="entry" ${field.level === "entry" ? "selected" : ""
    }>Entry</option>
      <option value="sense" ${field.level === "sense" ? "selected" : ""
    }>Sense</option>
    `;
  const removeButton = document.createElement("button");
  removeButton.textContent = "Remove";
  removeButton.className = "button danger";
  removeButton.onclick = () => div.remove();
  div.appendChild(nameInput);
  div.appendChild(levelSelect);
  div.appendChild(removeButton);
  return div;
}

function handleAddCustomField() {
  if (!customFieldsList) return;
  const el = createCustomFieldElement({ name: "", level: "entry" });
  customFieldsList.appendChild(el);
}

function handleSaveConfig() {
  const lexicon = getLexicon ? getLexicon() : null;
  if (!lexicon) return;
  const header = Array.isArray(lexicon.header)
    ? lexicon.header[0]
    : lexicon.header;
  if (!header) return;

  const nameInput = $("configName") as HTMLInputElement;
  const languageInput = $("configLanguage") as HTMLInputElement;
  const descriptionInput = $("configDescription") as HTMLInputElement;
  const authorInput = $("configAuthor") as HTMLInputElement;
  const versionInput = $("configVersion") as HTMLInputElement;
  const sortOrderInput = $("sortOrder") as HTMLInputElement;
  if (nameInput && nameInput.value) header.name = [nameInput.value];
  if (languageInput && languageInput.value)
    header.language = [languageInput.value];
  if (descriptionInput && descriptionInput.value)
    header.description = [descriptionInput.value];
  if (authorInput && authorInput.value) header.author = [authorInput.value];
  if (versionInput && versionInput.value) header.version = [versionInput.value];
  if (sortOrderInput && sortOrderInput.value)
    header["sort-order"] = [sortOrderInput.value];

  const fieldSpecs: any[] = [];
  if (customFieldsList) {
    customFieldsList
      .querySelectorAll(".custom-field")
      .forEach((fieldElement) => {
        const nameInput = fieldElement.querySelector("input");
        const levelSelect = fieldElement.querySelector("select");
        let fieldName = nameInput ? nameInput.value : "";
        fieldName = (fieldName || "").replace(/[^a-zA-Z0-9_]/g, "_");
        if (fieldName) {
          fieldSpecs.push({
            $: {
              name: fieldName,
              level: levelSelect ? levelSelect.value : "entry",
            },
            _: "",
          });
        }
      });
  }

  if (!header["custom-fields"]) header["custom-fields"] = [{}];
  if (!header["custom-fields"][0]) header["custom-fields"][0] = {};
  header["custom-fields"][0]["field-spec"] =
    fieldSpecs.length > 0 ? fieldSpecs : [];

  if (typeof onChange === "function") onChange();
  hide();
}
