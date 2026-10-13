// Diff viewer component

import { discoverDiffFields } from "./diffFields";
import { invoke } from "@tauri-apps/api/core";
import { LexiconEntry, LexiconSense } from "./LexiconTable";

type Lexicon = {
  header?: any;
  entry?: LexiconEntry[];
};

export interface DiffViewerOptions {
  getLexicon: () => Lexicon | null;
  getCurrentFile: () => string | null;
  onChange: () => void;
}

let getLexicon: (() => Lexicon | null) | null = null;
let getCurrentFile: (() => string | null) | null = null;
let onChange: (() => void) | null = null;
let lastPayload: { left: any; right: any } | null = null; // { left, right }
let includeEntryFields: Set<string> | null = null; // Set<string> or null for default all
let includeSenseFields: Set<string> | null = null; // Set<string>
let availableEntryFields: Set<string> | null = null; // Set<string>
let availableSenseFields: Set<string> | null = null; // Set<string>

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

// Window actions
// We move these to module scope functions but we need to expose them globally for HTML onclick strings 
// OR we rewrite the HTML generation to not use string onclicks.
// Refactoring to not use string onclicks is cleaner but validation-heavy.
// For now, we will expose a global on window temporarily or refactor render code.
// Let's attach to window to keep it simple with existing render logic, 
// then we can cleanup later.
declare global {
  interface Window {
    DiffViewer: {
      actions: {
        restoreEntry: (entryId: string, leftType: string) => void;
        deleteEntry: (entryId: string, leftType: string) => void;
        restoreSense: (entryId: string, senseId: string, leftType: string) => void;
        deleteSense: (entryId: string, senseId: string, leftType: string) => void;
      };
    };
  }
}

export function init(options: DiffViewerOptions) {
  getLexicon = options && options.getLexicon;
  getCurrentFile = options && options.getCurrentFile;
  onChange = options && options.onChange;

  const openBtn = $("diffBtn");
  const dlg = $("diffDialog");
  const closeBtn = $("diffCloseBtn");
  const runBtn = $("diffRunBtn");
  const selectFieldsBtn = $("diffSelectFieldsBtn");

  // Fields dialog
  const fieldsDlg = $("diffFieldsDialog");
  // const entryList = $("diffEntryFieldsList");
  // const senseList = $("diffSenseFieldsList");
  const fieldsSaveBtn = $("diffFieldsSaveBtn");
  const fieldsCancelBtn = $("diffFieldsCancelBtn");
  const fieldsSelectAllBtn = $("diffFieldsSelectAll");
  const fieldsClearBtn = $("diffFieldsClear");
  const fieldsRestoreBtn = $("diffFieldsRestoreBtn");
  const tabs = document.querySelectorAll("#diffFieldsDialog .config-tab");
  // const sections = document.querySelectorAll("#diffFieldsDialog .config-section");

  if (openBtn) openBtn.addEventListener("click", () => show());
  if (closeBtn) closeBtn.addEventListener("click", () => hide());
  if (dlg)
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg) hide();
    });
  if (selectFieldsBtn)
    selectFieldsBtn.addEventListener("click", () => openFieldsDialog());
  if (fieldsDlg)
    fieldsDlg.addEventListener("click", (e) => {
      if (e.target === fieldsDlg) fieldsDlg.classList.add("hidden");
    });
  if (fieldsCancelBtn)
    fieldsCancelBtn.addEventListener("click", () =>
      fieldsDlg!.classList.add("hidden")
    );
  if (tabs)
    tabs.forEach((tab) =>
      tab.addEventListener("click", () => switchFieldsTab(tab as HTMLElement))
    );
  if (fieldsSelectAllBtn)
    fieldsSelectAllBtn.addEventListener("click", () =>
      setAllFieldsChecked(true)
    );
  if (fieldsClearBtn)
    fieldsClearBtn.addEventListener("click", () => setAllFieldsChecked(false));
  if (fieldsRestoreBtn)
    fieldsRestoreBtn.addEventListener("click", () => restoreFieldsDefaults());
  if (fieldsSaveBtn)
    fieldsSaveBtn.addEventListener("click", () => saveFieldsSelection());
  if (runBtn)
    runBtn.addEventListener("click", async () => {
      clearResults();
      try {
        lastPayload = buildDiffPayload();
        if (!lastPayload) return;
        const opts = buildDiffOptions();
        const diff = await invoke("diff", {
          left: lastPayload.left,
          right: lastPayload.right,
          options: opts,
        });
        renderResults(diff);
      } catch (e: any) {
        renderError(e && e.message ? e.message : String(e));
      }
    });

  // Expose actions
  window.DiffViewer = {
    actions: {
      restoreEntry: applyRestoreEntry,
      deleteEntry: applyDeleteEntry,
      restoreSense: applyRestoreSense,
      deleteSense: applyDeleteSense,
    },
  };
}

function buildDiffPayload() {
  const lexicon = getLexicon ? getLexicon() : null;
  const path = getCurrentFile ? getCurrentFile() : null;
  if (!lexicon) {
    alert("No lexicon loaded");
    return null;
  }
  const leftSel = document.getElementById("diffLeftSource") as HTMLSelectElement;
  const rightSel = document.getElementById("diffRightSource") as HTMLSelectElement;
  const leftType = leftSel ? leftSel.value : "disk";
  const rightType = rightSel ? rightSel.value : "working";

  function makeSource(t: string) {
    if (t === "working") return { type: "object", data: { lexicon } };
    if (!path) {
      alert("No file path. Please save or open a file first.");
      throw new Error("No file path");
    }
    if (t === "disk") return { type: "disk", path };
    if (t === "head") return { type: "git", path, rev: "HEAD" };
    return { type: "object", data: { lexicon } };
  }

  const left = makeSource(leftType);
  const right = makeSource(rightType);
  return { left, right };
}

function buildDiffOptions() {
  const entry = includeEntryFields
    ? Array.from(includeEntryFields)
    : undefined;
  const sense = includeSenseFields
    ? Array.from(includeSenseFields)
    : undefined;
  // If user explicitly included dateModified, do not ignore timestamps
  const ignoreTimestamps = !(
    includeEntryFields && includeEntryFields.has("dateModified")
  );
  return {
    ignore_timestamps: ignoreTimestamps,
    include_entry_fields: entry,
    include_sense_fields: sense,
  };
}

function switchFieldsTab(tab: HTMLElement) {
  const t = tab && tab.dataset && tab.dataset.tab;
  if (!t) return;
  (document.querySelectorAll("#diffFieldsDialog .config-tab") || []).forEach(
    (x) => x.classList.remove("active")
  );
  tab.classList.add("active");
  (document.querySelectorAll("#diffFieldsDialog .config-section") || []).forEach(
    (s) => s.classList.remove("active")
  );
  const section = document.getElementById(
    t === "entryFields" ? "entryFieldsSection" : "senseFieldsSection"
  );
  if (section) section.classList.add("active");
}

async function openFieldsDialog() {
  const payload = buildDiffPayload();
  if (!payload) return;
  const trigger = $("diffSelectFieldsBtn") as HTMLButtonElement | null;
  if (trigger) trigger.disabled = true;
  let sources: any[];
  try {
    sources = await Promise.all([payload.left, payload.right].map(source =>
      source.type === "object" ? Promise.resolve(source.data) :
        invoke("get_lexicon_from_source", { source })
    ));
  } catch (error) {
    renderError(`Could not discover comparison fields: ${String(error)}`);
    return;
  } finally {
    if (trigger) trigger.disabled = false;
  }
  const { entry: entryFields, sense: senseFields } = discoverDiffFields(sources);
  // Preserve exclusions, while selecting newly discovered content by default.
  const mergeNewFields = (fields: Set<string>, previous: Set<string> | null, selected: Set<string> | null) => {
    if (!selected) return;
    fields.forEach(field => {
      if (!previous?.has(field) && !["dateCreated", "dateModified"].includes(field)) selected.add(field);
    });
  };
  mergeNewFields(entryFields, availableEntryFields, includeEntryFields);
  mergeNewFields(senseFields, availableSenseFields, includeSenseFields);
  availableEntryFields = new Set(entryFields);
  availableSenseFields = new Set(senseFields);

  // Default selections: include everything except ids/timestamps
  if (!includeEntryFields) {
    const defaultEntry = new Set(entryFields);
    defaultEntry.delete("id");
    defaultEntry.delete("dateCreated");
    defaultEntry.delete("dateModified");
    includeEntryFields = defaultEntry;
  }
  if (!includeSenseFields) {
    const defaultSense = new Set(senseFields);
    defaultSense.delete("id");
    includeSenseFields = defaultSense;
  }

  // Render checkboxes
  function renderList(
    container: HTMLElement | null,
    fields: Set<string>,
    selectedSet: Set<string> | null
  ) {
    if (!container || !selectedSet) return;
    container.innerHTML = "";
    const ul = document.createElement("ul");
    ul.style.listStyle = "none";
    ul.style.paddingLeft = "0";
    Array.from(fields)
      .sort()
      .forEach((name) => {
        const li = document.createElement("li");
        const label = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = selectedSet.has(name);
        cb.dataset.fieldName = name;
        cb.addEventListener("change", (e) => {
          if ((e.target as HTMLInputElement).checked) selectedSet.add(name);
          else selectedSet.delete(name);
        });
        label.appendChild(cb);
        const span = document.createElement("span");
        span.textContent = " " + name.replace(/^field \[name=(.*)\]$/, "$1 (custom field)");
        label.appendChild(span);
        li.appendChild(label);
        ul.appendChild(li);
      });
    container.appendChild(ul);
  }
  const entryListEl = $("diffEntryFieldsList");
  const senseListEl = $("diffSenseFieldsList");
  renderList(entryListEl, entryFields, includeEntryFields);
  renderList(senseListEl, senseFields, includeSenseFields);

  const dlg = $("diffFieldsDialog");
  if (dlg) dlg.classList.remove("hidden");
}

function setAllFieldsChecked(value: boolean) {
  const activeSection = document.querySelector(
    "#diffFieldsDialog .config-section.active"
  );
  if (!activeSection) return;
  const listId =
    activeSection.id === "entryFieldsSection"
      ? "diffEntryFieldsList"
      : "diffSenseFieldsList";
  const setRef =
    activeSection.id === "entryFieldsSection"
      ? includeEntryFields
      : includeSenseFields;
  const container = document.getElementById(listId);
  if (!container || !setRef) return;
  container.querySelectorAll('input[type="checkbox"]').forEach((cb: any) => {
    cb.checked = !!value;
    const name = cb.dataset.fieldName;
    if (!name) return;
    if (value) setRef.add(name);
    else setRef.delete(name);
  });
}

function saveFieldsSelection() {
  const dlg = $("diffFieldsDialog");
  if (dlg) dlg.classList.add("hidden");
}

function restoreFieldsDefaults() {
  // Recompute defaults from available sets
  if (!availableEntryFields || !availableSenseFields) {
    // If not built yet, open dialog to build from working
    openFieldsDialog();
    return;
  }
  const defEntry = new Set(availableEntryFields);
  defEntry.delete("id");
  defEntry.delete("dateCreated");
  defEntry.delete("dateModified");
  includeEntryFields = defEntry;

  const defSense = new Set(availableSenseFields);
  defSense.delete("id");
  includeSenseFields = defSense;

  // Re-render lists with defaults applied
  openFieldsDialog();
}

export function show() {
  const dlg = $("diffDialog");
  if (dlg) dlg.classList.remove("hidden");
}

export function hide() {
  const dlg = $("diffDialog");
  if (dlg) dlg.classList.add("hidden");
}

function clearResults() {
  const out = $("diffResults");
  if (out) out.innerHTML = "";
}

function renderError(msg: string) {
  const out = $("diffResults");
  if (!out) return;
  const div = document.createElement("div");
  div.className = "diff-error";
  div.textContent = `Error: ${msg}`;
  out.appendChild(div);
}

function renderResults(diff: any) {
  const out = $("diffResults");
  if (!out) return;
  out.replaceChildren();
  if (!diff?.summary) { out.textContent = "Unable to compute comparison."; return; }
  const source = (id: string) => document.getElementById(id) as HTMLSelectElement;
  const left = source("diffLeftSource");
  const right = source("diffRightSource");
  const allowed = right.value === "working" && ["disk", "head"].includes(left.value);
  const add = (parent: HTMLElement, tag: string, text: string, cls = "") => {
    const el = document.createElement(tag); el.textContent = text; el.className = cls;
    parent.appendChild(el); return el;
  };
  const text = (v: any): string => {
    if (v === null || v === undefined) return "Not present";
    if (v === "") return "Empty";
    if (Array.isArray(v)) return v.map(text).join("; ");
    if (typeof v === "object") return Object.entries(v).map(([k, val]) =>
      k === "_" ? text(val) : `${k === "$" ? "Attributes" : k}: ${text(val)}`).join(" · ");
    return String(v);
  };
  const name = (v: string) => v.replace(/^field \[name=([^\]]+)\]/, "$1")
    .replace(/@/g, "").replace(/-/g, " ");
  const table = (parent: HTMLElement, changes: any[]) => {
    const t = add(parent, "table", "", "diff-table");
    const head = add(t, "thead", ""); const hr = add(head, "tr", "");
    ["Field", `Before · ${left.selectedOptions[0].text}`, `After · ${right.selectedOptions[0].text}`]
      .forEach(label => add(hr, "th", label));
    const body = add(t, "tbody", "");
    changes.forEach(c => {
      const row = add(body, "tr", ""); add(row, "th", name(c.name));
      add(row, "td", text(c.before), "diff-val-old");
      add(row, "td", text(c.after), "diff-val-new");
    });
  };
  const summary = add(out, "div", "", "diff-summary");
  ["added", "removed", "modified"].forEach(kind =>
    add(summary, "span", `${diff.summary[`entries_${kind}`]} ${kind}`, `diff-stat ${kind}`));
  add(out, "p", `Changes from ${left.selectedOptions[0].text} → ${right.selectedOptions[0].text}.`);
  if (!allowed) add(out, "p", "To restore changes, compare Disk or HEAD → Working.", "diff-warning");
  if (!Object.values(diff.summary).some(Boolean)) add(out, "p", "No changes in the selected fields.", "diff-empty-state");
  const button = (parent: HTMLElement, label: string, action: () => void) => {
    if (!allowed) return;
    const btn = add(parent, "button", label, "button small") as HTMLButtonElement;
    btn.type = "button"; btn.onclick = action;
  };
  const details = (parent: HTMLElement, entry: any) => {
    if (!entry) return;
    const list = (v: any): any[] => Array.isArray(v) ? v : [v];
    const valueText = (v: any): string => {
      if (v === null || v === undefined || v === "") return "Empty";
      if (Array.isArray(v)) return v.map(valueText).join("; ");
      if (typeof v !== "object") return String(v);
      const parts: string[] = [];
      if (v._ !== undefined) parts.push(valueText(v._));
      Object.entries(v).filter(([k]) => k !== "$" && k !== "_").forEach(([k, val]) =>
        parts.push(`${name(k)}: ${valueText(val)}`));
      return parts.join(" · ") || "Empty";
    };
    const row = (container: HTMLElement, label: string, value: string) => {
      const r = add(container, "div", "", "diff-detail-row");
      add(r, "span", label, "diff-detail-label");
      add(r, "span", value, "diff-detail-value");
    };
    const fields = (container: HTMLElement, node: any) => {
      Object.entries(node).filter(([k]) => !["$", "sense", "lexical-unit"].includes(k))
        .forEach(([k, v]) => list(v).forEach(item => {
          const attrs = item && typeof item === "object" ? item.$ || {} : {};
          const label = k === "field" ? attrs.name || "Custom field" : name(k);
          const language = attrs.lang ? ` (${attrs.lang})` : "";
          row(container, label + language, valueText(item));
          Object.entries(attrs).filter(([key]) => !["name", "lang", "id"].includes(key))
            .forEach(([key, val]) => row(container, `${label} · ${name(key)}`, valueText(val)));
        }));
    };
    fields(parent, entry);
    list(entry.sense || []).forEach((sense, index) => {
      const block = add(parent, "div", "", "diff-sense-block");
      add(block, "div", `Sense ${sense.$?.order || index + 1}`, "diff-sense-header");
      fields(block, sense);
      if (sense.$?.id) {
        const metadata = document.createElement("details");
        add(metadata, "summary", "Sense ID");
        add(metadata, "small", sense.$.id, "diff-entry-id");
        block.appendChild(metadata);
      }
    });
  };
  const entries = diff.entries;
  ["added", "removed", "modified"].forEach(kind => {
    if (!entries[kind]?.length) return;
    add(out, "h4", `${kind[0].toUpperCase() + kind.slice(1)} entries`);
    entries[kind].forEach((item: any, index: number) => {
      const entry = kind === "modified" ? null : entries[`${kind}_details`]?.[index];
      const id = kind === "modified" ? item.id : item;
      const label = kind === "modified" ? item.lexical_unit : text(entry?.["lexical-unit"] ?? "Unnamed entry");
      const card = add(out, "div", "", "diff-card");
      const header = add(card, "div", "", "diff-card-header");
      const title = add(header, "div", label || "Unnamed entry", "diff-card-title");
      add(title, "small", id, "diff-entry-id");
      button(header, kind === "added" ? "Remove from working" : "Restore entry", () =>
        kind === "added" ? applyDeleteEntry(id, left.value) : applyRestoreEntry(id, left.value));
      const body = add(card, "div", "", "diff-card-body");
      if (entry) details(body, entry);
      if (kind !== "modified") return;
      if (item.fields?.length) table(body, item.fields);
      const senses = item.senses;
      ["added", "removed", "modified"].forEach(sk => senses?.[sk]?.forEach((sense: any, i: number) => {
        const sid = sk === "modified" ? sense.id : sense;
        const block = add(body, "div", "", "diff-sense-block");
        const sh = add(block, "div", "", "diff-sense-header");
        add(sh, "span", `Sense · ${sk}`);
        add(block, "small", sid, "diff-entry-id");
        button(sh, sk === "added" ? "Remove sense" : "Restore sense", () =>
          sk === "added" ? applyDeleteSense(id, sid, left.value) : applyRestoreSense(id, sid, left.value));
        if (sk === "modified") table(block, sense.changes);
        else details(block, senses[`${sk}_details`]?.[i]);
      }));
    });
  });
}

async function ensureAllowed(leftType: string) {
  if (lastPayload?.right?.type !== "object") return false;
  if (leftType !== "disk" && leftType !== "head") return false;
  if (leftType === "head") {
    const ok = confirm(
      "Are you sure? This will overwrite your in-editor state to match the last commit. You still need to Save to write to disk."
    );
    if (!ok) return false;
  }
  return true;
}

function findEntryById(lex: Lexicon | null, id: string) {
  if (!lex || !Array.isArray(lex.entry)) return { idx: -1, entry: null };
  const idx = lex.entry.findIndex(
    (e) => e && e.$ && String(e.$.id) === String(id)
  );
  return { idx, entry: idx >= 0 ? lex.entry[idx] : null };
}

async function applyRestoreEntry(entryId: string, leftType: string) {
  if (!(await ensureAllowed(leftType))) return;
  const payload = lastPayload;
  if (!payload) return;
  try {
    const left = await invoke<any>("get_lexicon_from_source", {
      source: payload.left,
    });
    const leftLex = (left && left.lexicon) || {};
    const { idx: lidx, entry: lentry } = findEntryById(leftLex, entryId);
    if (!lentry) {
      alert("Baseline entry not found");
      return;
    }
    const rightLex = getLexicon ? getLexicon() : null;
    if (!rightLex) return;
    const { idx: ridx } = findEntryById(rightLex, entryId);
    const clone = JSON.parse(JSON.stringify(lentry));
    if (!Array.isArray(rightLex.entry)) rightLex.entry = [];
    if (ridx >= 0) rightLex.entry![ridx] = clone;
    else rightLex.entry!.push(clone);
    if (onChange) onChange();
    // Recompute diff with current field selection
    payload.right = buildDiffPayload()!.right;
    const opts = buildDiffOptions();
    const diff = await invoke("diff", {
      left: payload.left,
      right: payload.right,
      options: opts,
    });
    renderResults(diff);
  } catch (e: any) {
    renderError(e && e.message ? e.message : String(e));
  }
}

async function applyDeleteEntry(entryId: string, leftType: string) {
  if (!(await ensureAllowed(leftType))) return;
  const payload = lastPayload;
  if (!payload) return;
  const rightLex = getLexicon ? getLexicon() : null;
  if (!rightLex || !Array.isArray(rightLex.entry)) return;
  const { idx } = findEntryById(rightLex, entryId);
  if (idx >= 0) rightLex.entry!.splice(idx, 1);
  if (onChange) onChange();
  payload.right = buildDiffPayload()!.right;
  const opts = buildDiffOptions();
  const diff = await invoke("diff", {
    left: payload.left,
    right: payload.right,
    options: opts,
  });
  renderResults(diff);
}

async function applyRestoreSense(entryId: string, senseId: string, leftType: string) {
  if (!(await ensureAllowed(leftType))) return;
  const payload = lastPayload;
  if (!payload) return;
  try {
    const left = await invoke<any>("get_lexicon_from_source", {
      source: payload.left,
    });
    const leftLex = (left && left.lexicon) || {};
    const { entry: lentry } = findEntryById(leftLex, entryId);
    if (!lentry) {
      alert("Baseline entry not found");
      return;
    }
    const lSense = (lentry.sense || []).find(
      (s) => s && s.$ && String(s.$.id || s.$.order) === String(senseId)
    );
    if (!lSense) {
      alert("Baseline sense not found");
      return;
    }
    const rightLex = getLexicon ? getLexicon() : null;
    if (!rightLex) return;
    const { idx: ridx, entry: rentry } = findEntryById(rightLex, entryId);
    if (ridx < 0 || !rentry) {
      alert("Target entry not found");
      return;
    }
    if (!Array.isArray(rentry.sense)) rentry.sense = [];
    const sidx = rentry.sense.findIndex(
      (s) => s && s.$ && String(s.$.id || s.$.order) === String(senseId)
    );
    const clone = JSON.parse(JSON.stringify(lSense));
    if (sidx >= 0) rentry.sense[sidx] = clone;
    else rentry.sense.push(clone);
    if (onChange) onChange();
    payload.right = buildDiffPayload()!.right;
    const opts = buildDiffOptions();
    const diff = await invoke("diff", {
      left: payload.left,
      right: payload.right,
      options: opts,
    });
    renderResults(diff);
  } catch (e: any) {
    renderError(e && e.message ? e.message : String(e));
  }
}

async function applyDeleteSense(entryId: string, senseId: string, leftType: string) {
  if (!(await ensureAllowed(leftType))) return;
  const payload = lastPayload;
  if (!payload) return;
  const rightLex = getLexicon ? getLexicon() : null;
  if (!rightLex) return;
  const { idx: ridx, entry: rentry } = findEntryById(rightLex, entryId);
  if (ridx < 0 || !rentry || !Array.isArray(rentry.sense)) return;
  const sidx = rentry.sense.findIndex(
    (s) => s && s.$ && String(s.$.id || s.$.order) === String(senseId)
  );
  if (sidx >= 0) rentry.sense.splice(sidx, 1);
  if (onChange) onChange();
  payload.right = buildDiffPayload()!.right;
  const opts = buildDiffOptions();
  const diff = await invoke("diff", {
    left: payload.left,
    right: payload.right,
    options: opts,
  });
  renderResults(diff);
}
