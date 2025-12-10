// Display options dialog controller.

import * as LexiconTable from "./LexiconTable";

// We define a partial type in case we need to reference LexiconTable more generally
// but direct import is better if we can rely on it.
// However, the original code used window.LexiconTable.
// We'll update the logic to accept a reference or use the imported module.

export interface DisplayOptionsConfig {
  onApply?: (config: { columns: string[]; expandMultiValue: boolean }) => void;
}

let dialogEl: HTMLElement | null = null;
let columnsListEl: HTMLElement | null = null;
let errorEl: HTMLElement | null = null;
let expandToggleEl: HTMLInputElement | null = null;
let cancelBtn: HTMLElement | null = null;
let applyBtn: HTMLElement | null = null;
let restoreBtn: HTMLElement | null = null;
let tabButtons: HTMLElement[] = [];
let tabSections = new Map<string, HTMLElement>();
let columnCheckboxes = new Map<string, HTMLInputElement>();
let isInitialized = false;
let onApplyCallback:
  | ((config: { columns: string[]; expandMultiValue: boolean }) => void)
  | null = null;

export function init(options?: DisplayOptionsConfig) {
  if (isInitialized) return;

  dialogEl = document.getElementById("displayOptionsDialog");
  columnsListEl = document.getElementById("displayColumnsList");
  errorEl = document.getElementById("displayColumnsError");
  expandToggleEl = document.getElementById(
    "displayExpandToggle"
  ) as HTMLInputElement;
  cancelBtn = document.getElementById("displayOptionsCancelBtn");
  applyBtn = document.getElementById("displayOptionsApplyBtn");
  restoreBtn = document.getElementById("displayOptionsRestoreBtn");

  if (
    !dialogEl ||
    !columnsListEl ||
    !expandToggleEl ||
    !cancelBtn ||
    !applyBtn ||
    !restoreBtn
  ) {
    console.warn("DisplayOptions dialog markup missing required elements.");
    return;
  }

  onApplyCallback =
    options && typeof options.onApply === "function" ? options.onApply : null;

  tabButtons = Array.from(dialogEl.querySelectorAll(".config-tab")) as HTMLElement[];
  tabSections = new Map();
  tabButtons.forEach((button) => {
    const tabName = button.dataset.tab;
    if (!tabName) return;
    const sectionId = `${tabName}Section`;
    const section = document.getElementById(sectionId);
    if (section) {
      tabSections.set(tabName, section);
    }
    button.addEventListener("click", () => activateTab(tabName));
  });

  cancelBtn.addEventListener("click", hide);
  restoreBtn.addEventListener("click", handleRestoreDefaults);
  applyBtn.addEventListener("click", handleApply);
  dialogEl.addEventListener("click", handleOverlayClick);

  isInitialized = true;
}

export function show() {
  if (!isInitialized) init();
  if (!dialogEl) return;

  renderColumns();
  syncFromCurrentConfig();
  activateTab("displayColumns");
  if (errorEl) errorEl.style.display = "none";

  dialogEl.classList.remove("hidden");
  document.addEventListener("keydown", handleKeydown);
}

export function hide() {
  if (!dialogEl) return;
  dialogEl.classList.add("hidden");
  if (errorEl) errorEl.style.display = "none";
  document.removeEventListener("keydown", handleKeydown);
}

function handleOverlayClick(event: MouseEvent) {
  if (event.target === dialogEl) {
    hide();
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    hide();
  }
}

function handleApply() {
  const selectedColumns = getSelectedColumns();
  if (selectedColumns.length === 0) {
    if (errorEl) errorEl.style.display = "block";
    return;
  }

  if (errorEl) errorEl.style.display = "none";

  const expand = !!(expandToggleEl && expandToggleEl.checked);

  if (LexiconTable && typeof LexiconTable.setDisplayConfig === "function") {
    LexiconTable.setDisplayConfig({
      columns: selectedColumns,
      expandMultiValue: expand,
    });
  }

  if (typeof onApplyCallback === "function") {
    onApplyCallback({ columns: selectedColumns, expandMultiValue: expand });
  }

  hide();
}

function handleRestoreDefaults() {
  const available = getAvailableColumns();
  if (available.length === 0) return;

  available.forEach((column) => {
    const checkbox = columnCheckboxes.get(column.id);
    if (checkbox) {
      checkbox.checked = !!column.defaultSelected;
    }
  });

  if (expandToggleEl) {
    expandToggleEl.checked = false;
  }

  if (errorEl) errorEl.style.display = "none";
}

function getSelectedColumns() {
  const available = getAvailableColumns();
  const selected: string[] = [];
  available.forEach((column) => {
    const checkbox = columnCheckboxes.get(column.id);
    if (checkbox && checkbox.checked) {
      selected.push(column.id);
    }
  });
  return selected;
}

function renderColumns() {
  if (!columnsListEl) return;

  const available = getAvailableColumns();
  columnCheckboxes = new Map();
  columnsListEl.innerHTML = "";

  available.forEach((column) => {
    const label = document.createElement("label");
    label.setAttribute("for", `display_column_${column.id}`);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `display_column_${column.id}`;
    checkbox.value = column.id;
    checkbox.dataset.columnId = column.id;

    const text = document.createElement("span");
    text.textContent = column.label;

    label.appendChild(checkbox);
    label.appendChild(text);
    columnsListEl!.appendChild(label);

    columnCheckboxes.set(column.id, checkbox);
  });
}

function syncFromCurrentConfig() {
  if (!LexiconTable || typeof LexiconTable.getDisplayConfig !== "function")
    return;
  const config = LexiconTable.getDisplayConfig() || {};

  const columnsSet = new Set(
    Array.isArray(config.columns)
      ? config.columns.map((c: string) => c.toLowerCase())
      : []
  );
  columnCheckboxes.forEach((checkbox, id) => {
    checkbox.checked = columnsSet.size === 0 ? true : columnsSet.has(id);
  });

  if (expandToggleEl) {
    expandToggleEl.checked = !!config.expandMultiValue;
  }
}

function activateTab(tabName: string) {
  tabButtons.forEach((button) => {
    if (!button || !button.dataset) return;
    if (button.dataset.tab === tabName) {
      button.classList.add("active");
    } else {
      button.classList.remove("active");
    }
  });

  tabSections.forEach((section, name) => {
    if (!section) return;
    if (name === tabName) {
      section.classList.add("active");
    } else {
      section.classList.remove("active");
    }
  });
}

function getAvailableColumns() {
  if (
    !LexiconTable ||
    typeof LexiconTable.getAvailableColumns !== "function"
  ) {
    return [];
  }
  return LexiconTable.getAvailableColumns();
}
