// Diff viewer component

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
let includeVariants = true;
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

function openFieldsDialog() {
  // Build lists from union of Left and Right (if available), else from working
  const lexWorking = getLexicon ? getLexicon() : null;
  // const lexLeft = null; // Future: merge fields from left as well
  // Build sets
  const entryFields = new Set([
    "lexical-unit",
    "morph-type",
    "variant",
    "id",
    "dateCreated",
    "dateModified",
  ]);
  const senseFields = new Set(["grammatical-category", "gloss", "id"]);
  function addEntryKeys(lex: Lexicon | null) {
    if (!lex) return;
    (lex.entry || []).forEach((e) => {
      Object.keys(e || {}).forEach((k) => {
        if (k === "$" || k === "sense" || k === "variant") return;
        entryFields.add(k);
      });
      if (Array.isArray(e && e.variant)) entryFields.add("variant");
      (e.sense || []).forEach((s) => {
        Object.keys(s || {}).forEach((k) => {
          if (k === "$") return;
          senseFields.add(k);
        });
      });
    });
  }
  addEntryKeys(lexWorking);
  availableEntryFields = new Set(entryFields);
  availableSenseFields = new Set(senseFields);
  // Populate from header custom fields as well
  const header =
    lexWorking &&
    (Array.isArray(lexWorking.header)
      ? lexWorking.header[0]
      : lexWorking.header);
  if (header && header["custom-fields"] && header["custom-fields"][0]) {
    const specs = header["custom-fields"][0]["field-spec"];
    const arr = Array.isArray(specs) ? specs : specs ? [specs] : [];
    arr.forEach((f: any) => {
      if (f && f.$ && f.$.name) {
        const lvl = f.$.level || "entry";
        if (lvl === "entry") entryFields.add(f.$.name);
        if (lvl === "sense") senseFields.add(f.$.name);
      }
    });
  }

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
        span.textContent = " " + name;
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
  out.innerHTML = "";
  if (!diff || !diff.summary) {
    out.textContent = "No differences or failed to compute diff.";
    return;
  }

  // Controls check
  const leftType = (document.getElementById("diffLeftSource") as HTMLSelectElement)
    ?.value;
  // const rightType = (document.getElementById("diffRightSource") as HTMLSelectElement)?.value;
  const allowed = /* rightType === 'working' && */ leftType === "disk" ||
    leftType === "head";

  // Summary
  const { summary, entries } = diff;
  const sum = document.createElement("div");
  sum.className = "diff-summary";
  sum.innerHTML = `
        <div class="diff-stat added">Added: ${summary.entries_added}</div>
        <div class="diff-stat removed">Removed: ${summary.entries_removed}</div>
        <div class="diff-stat modified">Modified: ${summary.entries_modified}</div>
    `;
  out.appendChild(sum);

  if (!allowed) {
    const warning = document.createElement("div");
    warning.style.marginBottom = "16px";
    warning.style.color = "#856404";
    warning.style.background = "#fff3cd";
    warning.style.padding = "8px";
    warning.style.borderRadius = "4px";
    warning.textContent =
      'Note: Restore/merge actions are disabled. To enable them, set "Compare" to Disk/HEAD and "vs" to Working.';
    out.appendChild(warning);
  }

  const section = document.createElement("div");
  section.className = "diff-section";

  // Helper to create a table row
  const createRow = (label: string, oldVal: any, newVal: any) => {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.textContent = label;
    const tdOld = document.createElement("td");
    tdOld.className = "diff-val-old";
    tdOld.textContent = oldVal || "null";
    if (!oldVal) tdOld.classList.add("diff-null");

    const tdNew = document.createElement("td");
    tdNew.className = "diff-val-new";
    tdNew.textContent = newVal || "null";
    if (!newVal) tdNew.classList.add("diff-null");

    tr.appendChild(th);
    tr.appendChild(tdOld);
    tr.appendChild(tdNew);
    return tr;
  };

  // Added entries
  if (entries.added && entries.added.length) {
    const h = document.createElement("h4");
    h.textContent = "Added Entries (in Right)";
    section.appendChild(h);
    entries.added.forEach((id: string) => {
      const card = document.createElement("div");
      card.className = "diff-card";
      card.innerHTML = `
            <div class="diff-card-header">
                <span class="diff-card-title">${id} <span class="diff-tag added">Added</span></span>
                <div class="diff-card-actions">
                    <button class="button small" ${!allowed ? "disabled" : ""
        } onclick="window.DiffViewer.actions.deleteEntry('${id}', '${leftType}')">Delete</button>
                </div>
            </div>
        `;
      section.appendChild(card);
    });
  }

  // Removed entries
  if (entries.removed && entries.removed.length) {
    const h = document.createElement("h4");
    h.textContent = "Removed Entries (missing in Right)";
    section.appendChild(h);
    entries.removed.forEach((id: string) => {
      const card = document.createElement("div");
      card.className = "diff-card";
      card.innerHTML = `
            <div class="diff-card-header">
                <span class="diff-card-title">${id} <span class="diff-tag removed">Removed</span></span>
                <div class="diff-card-actions">
                    <button class="button small" ${!allowed ? "disabled" : ""
        } onclick="window.DiffViewer.actions.restoreEntry('${id}', '${leftType}')">Restore</button>
                </div>
            </div>
        `;
      section.appendChild(card);
    });
  }

  // Modified entries
  if (entries.modified && entries.modified.length) {
    const h = document.createElement("h4");
    h.textContent = "Modified Entries";
    section.appendChild(h);

    entries.modified.forEach((m: any) => {
      const card = document.createElement("div");
      card.className = "diff-card";

      const header = document.createElement("div");
      header.className = "diff-card-header";
      const title = document.createElement("span");
      title.className = "diff-card-title";
      title.textContent = `${m.id} ${m.lexical_unit ? "(" + m.lexical_unit + ")" : ""
        }`;

      const actions = document.createElement("div");
      actions.className = "diff-card-actions";
      const restoreBtn = document.createElement("button");
      restoreBtn.className = "button small";
      restoreBtn.textContent = "Restore Full Entry";
      restoreBtn.disabled = !allowed;
      restoreBtn.onclick = () =>
        window.DiffViewer.actions.restoreEntry(m.id, leftType);
      actions.appendChild(restoreBtn);

      header.appendChild(title);
      header.appendChild(actions);
      card.appendChild(header);

      const body = document.createElement("div");
      body.className = "diff-card-body";

      // Fields table
      if (m.fields && m.fields.length) {
        const table = document.createElement("table");
        table.className = "diff-table";
        m.fields.forEach((f: any) => {
          if (f.kind === "variants") {
            table.appendChild(
              createRow(
                "Variants",
                JSON.stringify(f.before),
                JSON.stringify(f.after)
              )
            );
          } else {
            table.appendChild(createRow(f.name, f.before, f.after));
          }
        });
        body.appendChild(table);
      }

      // Senses
      if (m.senses) {
        const s = m.senses;

        if (s.added && s.added.length) {
          s.added.forEach((sid: string) => {
            const block = document.createElement("div");
            block.className = "diff-sense-block";
            block.innerHTML = `
                        <div class="diff-sense-header">
                            <span>Sense ${sid} <span class="diff-tag added">Added</span></span>
                            <button class="button small" ${!allowed ? "disabled" : ""
              } onclick="window.DiffViewer.actions.deleteSense('${m.id}', '${sid}', '${leftType}')">Delete</button>
                        </div>
                      `;
            body.appendChild(block);
          });
        }

        if (s.removed && s.removed.length) {
          s.removed.forEach((sid: string) => {
            const block = document.createElement("div");
            block.className = "diff-sense-block";
            block.innerHTML = `
                        <div class="diff-sense-header">
                            <span>Sense ${sid} <span class="diff-tag removed">Removed</span></span>
                            <button class="button small" ${!allowed ? "disabled" : ""
              } onclick="window.DiffViewer.actions.restoreSense('${m.id}', '${sid}', '${leftType}')">Restore</button>
                        </div>
                      `;
            body.appendChild(block);
          });
        }

        if (s.modified && s.modified.length) {
          s.modified.forEach((sm: any) => {
            const block = document.createElement("div");
            block.className = "diff-sense-block";

            const sheader = document.createElement("div");
            sheader.className = "diff-sense-header";
            sheader.innerHTML = `
                        <span>Sense ${sm.id} <span class="diff-tag" style="background:#fff3bf;color:#f08c00">Modified</span></span>
                        <button class="button small" ${!allowed ? "disabled" : ""
              } onclick="window.DiffViewer.actions.restoreSense('${m.id}', '${sm.id}', '${leftType}')">Restore</button>
                      `;
            block.appendChild(sheader);

            const table = document.createElement("table");
            table.className = "diff-table";
            sm.changes.forEach((c: any) => {
              table.appendChild(createRow(c.name, c.before, c.after));
            });
            block.appendChild(table);

            body.appendChild(block);
          });
        }
      }

      card.appendChild(body);
      section.appendChild(card);
    });
  }

  out.appendChild(section);
}

async function ensureAllowed(leftType: string) {
  // const rightType = (document.getElementById("diffRightSource") as HTMLSelectElement)?.value;
  // if (rightType !== 'working') return false;
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
  const opts = buildDiffOptions();
  const diff = await invoke("diff", {
    left: payload.left,
    right: payload.right,
    options: opts,
  });
  renderResults(diff);
}

