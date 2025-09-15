// Diff viewer component: opens a dialog, lets user pick sources, calls backend diff, and renders results
(function () {
  let getLexicon = null;
  let getCurrentFile = null;
  let onChange = null;
  let lastPayload = null; // { left, right }
  let includeEntryFields = null; // Set<string> or null for default all
  let includeSenseFields = null; // Set<string>
  let includeVariants = true;
  let availableEntryFields = null; // Set<string>
  let availableSenseFields = null; // Set<string>

  function $(id) { return document.getElementById(id); }

  function init(options) {
    getLexicon = options && options.getLexicon;
    getCurrentFile = options && options.getCurrentFile;
    onChange = options && options.onChange;

    const openBtn = $('diffBtn');
    const dlg = $('diffDialog');
    const closeBtn = $('diffCloseBtn');
    const runBtn = $('diffRunBtn');
    const selectFieldsBtn = $('diffSelectFieldsBtn');

    // Fields dialog
    const fieldsDlg = $('diffFieldsDialog');
    const entryList = $('diffEntryFieldsList');
    const senseList = $('diffSenseFieldsList');
    const fieldsSaveBtn = $('diffFieldsSaveBtn');
    const fieldsCancelBtn = $('diffFieldsCancelBtn');
    const fieldsSelectAllBtn = $('diffFieldsSelectAll');
    const fieldsClearBtn = $('diffFieldsClear');
    const fieldsRestoreBtn = $('diffFieldsRestoreBtn');
    const tabs = (document.querySelectorAll('#diffFieldsDialog .config-tab'));
    const sections = (document.querySelectorAll('#diffFieldsDialog .config-section'));

    if (openBtn) openBtn.addEventListener('click', () => show());
    if (closeBtn) closeBtn.addEventListener('click', () => hide());
    if (dlg) dlg.addEventListener('click', (e) => { if (e.target === dlg) hide(); });
    if (selectFieldsBtn) selectFieldsBtn.addEventListener('click', () => openFieldsDialog());
    if (fieldsDlg) fieldsDlg.addEventListener('click', (e) => { if (e.target === fieldsDlg) fieldsDlg.classList.add('hidden'); });
    if (fieldsCancelBtn) fieldsCancelBtn.addEventListener('click', () => fieldsDlg.classList.add('hidden'));
    if (tabs && tabs.forEach) tabs.forEach((tab) => tab.addEventListener('click', () => switchFieldsTab(tab)));
    if (fieldsSelectAllBtn) fieldsSelectAllBtn.addEventListener('click', () => setAllFieldsChecked(true));
    if (fieldsClearBtn) fieldsClearBtn.addEventListener('click', () => setAllFieldsChecked(false));
    if (fieldsRestoreBtn) fieldsRestoreBtn.addEventListener('click', () => restoreFieldsDefaults());
    if (fieldsSaveBtn) fieldsSaveBtn.addEventListener('click', () => saveFieldsSelection());
    if (runBtn) runBtn.addEventListener('click', async () => {
      clearResults();
      try {
        lastPayload = buildDiffPayload();
        if (!lastPayload) return;
        const opts = buildDiffOptions();
        const diff = await window.pywebview.api.diff(lastPayload.left, lastPayload.right, opts);
        renderResults(diff);
      } catch (e) {
        renderError(e && e.message ? e.message : String(e));
      }
    });
  }

  function buildDiffPayload() {
    const lexicon = getLexicon ? getLexicon() : null;
    const path = getCurrentFile ? getCurrentFile() : null;
    if (!lexicon) {
      alert('No lexicon loaded');
      return null;
    }
    const leftSel = document.getElementById('diffLeftSource');
    const rightSel = document.getElementById('diffRightSource');
    const leftType = leftSel ? leftSel.value : 'disk';
    const rightType = rightSel ? rightSel.value : 'working';

    function makeSource(t) {
      if (t === 'working') return { type: 'object', data: { lexicon } };
      if (!path) {
        alert('No file path. Please save or open a file first.');
        throw new Error('No file path');
      }
      if (t === 'disk') return { type: 'disk', path };
      if (t === 'head') return { type: 'git', path, rev: 'HEAD' };
      return { type: 'object', data: { lexicon } };
    }

    const left = makeSource(leftType);
    const right = makeSource(rightType);
    return { left, right };
  }

  function buildDiffOptions() {
    const entry = includeEntryFields ? Array.from(includeEntryFields) : undefined;
    const sense = includeSenseFields ? Array.from(includeSenseFields) : undefined;
    // If user explicitly included dateModified, do not ignore timestamps
    const ignoreTimestamps = !(includeEntryFields && includeEntryFields.has('dateModified'));
    return {
      ignore_timestamps: ignoreTimestamps,
      include_entry_fields: entry,
      include_sense_fields: sense,
    };
  }

  function switchFieldsTab(tab) {
    const t = tab && tab.dataset && tab.dataset.tab;
    if (!t) return;
    (document.querySelectorAll('#diffFieldsDialog .config-tab') || []).forEach((x) => x.classList.remove('active'));
    tab.classList.add('active');
    (document.querySelectorAll('#diffFieldsDialog .config-section') || []).forEach((s) => s.classList.remove('active'));
    const section = document.getElementById(t === 'entryFields' ? 'entryFieldsSection' : 'senseFieldsSection');
    if (section) section.classList.add('active');
  }

  function openFieldsDialog() {
    // Build lists from union of Left and Right (if available), else from working
    const lexWorking = getLexicon ? getLexicon() : null;
    // const lexLeft = null; // Future: merge fields from left as well
    // Build sets
    const entryFields = new Set(['lexical-unit', 'morph-type', 'variant', 'id', 'dateCreated', 'dateModified']);
    const senseFields = new Set(['grammatical-category', 'gloss', 'id']);
    function addEntryKeys(lex) {
      if (!lex) return;
      (lex.entry || []).forEach((e) => {
        Object.keys(e || {}).forEach((k) => {
          if (k === '$' || k === 'sense' || k === 'variant') return;
          entryFields.add(k);
        });
        if (Array.isArray(e && e.variant)) entryFields.add('variant');
        (e.sense || []).forEach((s) => {
          Object.keys(s || {}).forEach((k) => {
            if (k === '$') return;
            senseFields.add(k);
          });
        });
      });
    }
    addEntryKeys(lexWorking);
    availableEntryFields = new Set(entryFields);
    availableSenseFields = new Set(senseFields);
    // Populate from header custom fields as well
    const header = lexWorking && (Array.isArray(lexWorking.header) ? lexWorking.header[0] : lexWorking.header);
    if (header && header['custom-fields'] && header['custom-fields'][0]) {
      const specs = header['custom-fields'][0]['field-spec'];
      const arr = Array.isArray(specs) ? specs : (specs ? [specs] : []);
      arr.forEach((f) => {
        if (f && f.$ && f.$.name) {
          const lvl = f.$.level || 'entry';
          if (lvl === 'entry') entryFields.add(f.$.name);
          if (lvl === 'sense') senseFields.add(f.$.name);
        }
      });
    }

    // Default selections: include everything except ids/timestamps
    if (!includeEntryFields) {
      const defaultEntry = new Set(entryFields);
      defaultEntry.delete('id');
      defaultEntry.delete('dateCreated');
      defaultEntry.delete('dateModified');
      includeEntryFields = defaultEntry;
    }
    if (!includeSenseFields) {
      const defaultSense = new Set(senseFields);
      defaultSense.delete('id');
      includeSenseFields = defaultSense;
    }

    // Render checkboxes
    function renderList(container, fields, selectedSet) {
      if (!container) return;
      container.innerHTML = '';
      const ul = document.createElement('ul');
      ul.style.listStyle = 'none';
      ul.style.paddingLeft = '0';
      Array.from(fields).sort().forEach((name) => {
        const li = document.createElement('li');
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = selectedSet.has(name);
        cb.dataset.fieldName = name;
        cb.addEventListener('change', (e) => {
          if (e.target.checked) selectedSet.add(name); else selectedSet.delete(name);
        });
        label.appendChild(cb);
        const span = document.createElement('span');
        span.textContent = ' ' + name;
        label.appendChild(span);
        li.appendChild(label);
        ul.appendChild(li);
      });
      container.appendChild(ul);
    }
    const entryListEl = $('diffEntryFieldsList');
    const senseListEl = $('diffSenseFieldsList');
    renderList(entryListEl, entryFields, includeEntryFields);
    renderList(senseListEl, senseFields, includeSenseFields);

    const dlg = $('diffFieldsDialog');
    if (dlg) dlg.classList.remove('hidden');
  }

  function setAllFieldsChecked(value) {
    const activeSection = document.querySelector('#diffFieldsDialog .config-section.active');
    if (!activeSection) return;
    const listId = activeSection.id === 'entryFieldsSection' ? 'diffEntryFieldsList' : 'diffSenseFieldsList';
    const setRef = activeSection.id === 'entryFieldsSection' ? includeEntryFields : includeSenseFields;
    const container = document.getElementById(listId);
    if (!container) return;
    container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.checked = !!value;
      const name = cb.dataset.fieldName;
      if (!name) return;
      if (value) setRef.add(name); else setRef.delete(name);
    });
  }

  function saveFieldsSelection() {
    const dlg = $('diffFieldsDialog');
    if (dlg) dlg.classList.add('hidden');
  }

  function restoreFieldsDefaults() {
    // Recompute defaults from available sets
    if (!availableEntryFields || !availableSenseFields) {
      // If not built yet, open dialog to build from working
      openFieldsDialog();
      return;
    }
    const defEntry = new Set(availableEntryFields);
    defEntry.delete('id');
    defEntry.delete('dateCreated');
    defEntry.delete('dateModified');
    includeEntryFields = defEntry;

    const defSense = new Set(availableSenseFields);
    defSense.delete('id');
    includeSenseFields = defSense;

    // Re-render lists with defaults applied
    openFieldsDialog();
  }

  function show() {
    const dlg = $('diffDialog');
    if (dlg) dlg.classList.remove('hidden');
  }

  function hide() {
    const dlg = $('diffDialog');
    if (dlg) dlg.classList.add('hidden');
  }

  function clearResults() {
    const out = $('diffResults');
    if (out) out.innerHTML = '';
  }

  function renderError(msg) {
    const out = $('diffResults');
    if (!out) return;
    const div = document.createElement('div');
    div.className = 'diff-error';
    div.textContent = `Error: ${msg}`;
    out.appendChild(div);
  }

  function renderResults(diff) {
    const out = $('diffResults');
    if (!out) return;
    out.innerHTML = '';
    if (!diff || !diff.summary) {
      out.textContent = 'No differences or failed to compute diff.';
      return;
    }
    const { summary, entries } = diff;
    const sum = document.createElement('div');
    sum.className = 'diff-summary';
    sum.textContent = `Added: ${summary.entries_added}  Removed: ${summary.entries_removed}  Modified: ${summary.entries_modified}`;
    out.appendChild(sum);

    const section = document.createElement('div');
    section.className = 'diff-section';

    const controlsInfo = document.createElement('div');
    const leftType = (document.getElementById('diffLeftSource') || {}).value;
    const rightType = (document.getElementById('diffRightSource') || {}).value;
    const allowed = rightType === 'working' && (leftType === 'disk' || leftType === 'head');
    controlsInfo.style.margin = '6px 0 12px';
    controlsInfo.style.fontSize = '12px';
    controlsInfo.textContent = allowed ? 'Actions enabled: apply changes to Working (in editor) to match Left (basis).' : 'Actions disabled for this combination.';
    section.appendChild(controlsInfo);

    // Added entries
    if (entries.added && entries.added.length) {
      const h = document.createElement('h4');
      h.textContent = 'Added Entries';
      section.appendChild(h);
      const ul = document.createElement('ul');
      entries.added.forEach((id) => {
        const li = document.createElement('li');
        li.textContent = id + ' ';
        const btn = document.createElement('button');
        btn.textContent = 'Delete (match Left)';
        btn.className = 'button';
        btn.disabled = !allowed;
        btn.style.marginLeft = '8px';
        btn.onclick = async () => applyDeleteEntry(id, leftType);
        li.appendChild(btn);
        ul.appendChild(li);
      });
      section.appendChild(ul);
    }

    // Removed entries
    if (entries.removed && entries.removed.length) {
      const h = document.createElement('h4');
      h.textContent = 'Removed Entries';
      section.appendChild(h);
      const ul = document.createElement('ul');
      entries.removed.forEach((id) => {
        const li = document.createElement('li');
        li.textContent = id + ' ';
        const btn = document.createElement('button');
        btn.textContent = 'Restore from Left';
        btn.className = 'button';
        btn.disabled = !allowed;
        btn.style.marginLeft = '8px';
        btn.onclick = async () => applyRestoreEntry(id, leftType);
        li.appendChild(btn);
        ul.appendChild(li);
      });
      section.appendChild(ul);
    }

    // Modified entries
    if (entries.modified && entries.modified.length) {
      const h = document.createElement('h4');
      h.textContent = 'Modified Entries';
      section.appendChild(h);
      entries.modified.forEach((m) => section.appendChild(renderModifiedEntry(m, allowed, leftType)));
    }

    out.appendChild(section);
  }

  function renderModifiedEntry(m, allowed, leftType) {
    const wrap = document.createElement('div');
    wrap.className = 'diff-entry';
    const title = document.createElement('div');
    title.className = 'diff-entry-title';
    title.textContent = `Entry ${m.id} ${m.lexical_unit ? '(' + m.lexical_unit + ')' : ''}`;
    wrap.appendChild(title);

    const buttons = document.createElement('div');
    const btnEntry = document.createElement('button');
    btnEntry.textContent = 'Restore Entry from Left';
    btnEntry.className = 'button';
    btnEntry.disabled = !allowed;
    btnEntry.style.margin = '4px 0 8px';
    btnEntry.onclick = async () => applyRestoreEntry(m.id, leftType);
    buttons.appendChild(btnEntry);
    wrap.appendChild(buttons);

    if (m.fields && m.fields.length) {
      const h = document.createElement('div');
      h.className = 'diff-subtitle';
      h.textContent = 'Fields';
      wrap.appendChild(h);
      const ul = document.createElement('ul');
      m.fields.forEach((f) => {
        const li = document.createElement('li');
        if (f.kind === 'variants') {
          li.textContent = `variants: ${JSON.stringify(f.before)} -> ${JSON.stringify(f.after)}`;
        } else {
          li.textContent = `${f.name}: ${f.before} -> ${f.after}`;
        }
        ul.appendChild(li);
      });
      wrap.appendChild(ul);
    }

    if (m.senses) {
      const s = m.senses;
      const h = document.createElement('div');
      h.className = 'diff-subtitle';
      h.textContent = 'Senses';
      wrap.appendChild(h);
      if (s.reordered) {
        const p = document.createElement('div');
        p.textContent = 'Senses reordered';
        wrap.appendChild(p);
      }
      if (s.added && s.added.length) {
        const block = document.createElement('div');
        const title = document.createElement('div');
        title.textContent = 'Added senses:';
        block.appendChild(title);
        const ul = document.createElement('ul');
        s.added.forEach((sid) => {
          const li = document.createElement('li');
          li.textContent = sid + ' ';
          const btn = document.createElement('button');
          btn.textContent = 'Delete sense';
          btn.className = 'button';
          btn.disabled = !allowed;
          btn.style.marginLeft = '8px';
          btn.onclick = async () => applyDeleteSense(m.id, sid, leftType);
          li.appendChild(btn);
          ul.appendChild(li);
        });
        block.appendChild(ul);
        wrap.appendChild(block);
      }
      if (s.removed && s.removed.length) {
        const block = document.createElement('div');
        const title = document.createElement('div');
        title.textContent = 'Removed senses:';
        block.appendChild(title);
        const ul = document.createElement('ul');
        s.removed.forEach((sid) => {
          const li = document.createElement('li');
          li.textContent = sid + ' ';
          const btn = document.createElement('button');
          btn.textContent = 'Restore sense from Left';
          btn.className = 'button';
          btn.disabled = !allowed;
          btn.style.marginLeft = '8px';
          btn.onclick = async () => applyRestoreSense(m.id, sid, leftType);
          ul.appendChild(li);
          li.appendChild(btn);
        });
        block.appendChild(ul);
        wrap.appendChild(block);
      }
      if (s.modified && s.modified.length) {
        const list = document.createElement('div');
        s.modified.forEach((sm) => {
          const item = document.createElement('div');
          item.className = 'diff-sense';
          const head = document.createElement('div');
          head.textContent = `Sense ${sm.id}`;
          item.appendChild(head);
          const ul = document.createElement('ul');
          sm.changes.forEach((c) => {
            const li = document.createElement('li');
            li.textContent = `${c.name}: ${c.before} -> ${c.after}`;
            ul.appendChild(li);
          });
          item.appendChild(ul);
          const btn = document.createElement('button');
          btn.textContent = 'Restore Sense from Left';
          btn.className = 'button';
          btn.disabled = !allowed;
          btn.style.margin = '4px 0 8px';
          btn.onclick = async () => applyRestoreSense(m.id, sm.id, leftType);
          item.appendChild(btn);
          list.appendChild(item);
        });
        wrap.appendChild(list);
      }
    }
    return wrap;
  }

  async function ensureAllowed(leftType) {
    const rightType = (document.getElementById('diffRightSource') || {}).value;
    if (rightType !== 'working') return false;
    if (leftType !== 'disk' && leftType !== 'head') return false;
    if (leftType === 'head') {
      const ok = confirm('Are you sure? This will overwrite your in-editor state to match the last commit. You still need to Save to write to disk.');
      if (!ok) return false;
    }
    return true;
  }

  function findEntryById(lex, id) {
    if (!lex || !Array.isArray(lex.entry)) return { idx: -1, entry: null };
    const idx = lex.entry.findIndex((e) => e && e.$ && String(e.$.id) === String(id));
    return { idx, entry: idx >= 0 ? lex.entry[idx] : null };
  }

  async function applyRestoreEntry(entryId, leftType) {
    if (!(await ensureAllowed(leftType))) return;
    if (!lastPayload) return;
    try {
      const left = await window.pywebview.api.get_lexicon_from_source(lastPayload.left);
      const leftLex = (left && left.lexicon) || {};
      const { idx: lidx, entry: lentry } = findEntryById(leftLex, entryId);
      if (!lentry) { alert('Baseline entry not found'); return; }
      const rightLex = getLexicon ? getLexicon() : null;
      if (!rightLex) return;
      const { idx: ridx } = findEntryById(rightLex, entryId);
      const clone = JSON.parse(JSON.stringify(lentry));
      const now = new Date().toISOString();
      if (!clone.$) clone.$ = {};
      clone.$.dateModified = now;
      if (!Array.isArray(rightLex.entry)) rightLex.entry = [];
      if (ridx >= 0) rightLex.entry[ridx] = clone; else rightLex.entry.push(clone);
      if (onChange) onChange();
      // Recompute diff with current field selection
      const opts = buildDiffOptions();
      const diff = await window.pywebview.api.diff(lastPayload.left, lastPayload.right, opts);
      renderResults(diff);
    } catch (e) {
      renderError(e && e.message ? e.message : String(e));
    }
  }

  async function applyDeleteEntry(entryId, leftType) {
    if (!(await ensureAllowed(leftType))) return;
    const rightLex = getLexicon ? getLexicon() : null;
    if (!rightLex || !Array.isArray(rightLex.entry)) return;
    const { idx } = findEntryById(rightLex, entryId);
    if (idx >= 0) rightLex.entry.splice(idx, 1);
    if (onChange) onChange();
    const opts = buildDiffOptions();
    const diff = await window.pywebview.api.diff(lastPayload.left, lastPayload.right, opts);
    renderResults(diff);
  }

  async function applyRestoreSense(entryId, senseId, leftType) {
    if (!(await ensureAllowed(leftType))) return;
    if (!lastPayload) return;
    try {
      const left = await window.pywebview.api.get_lexicon_from_source(lastPayload.left);
      const leftLex = (left && left.lexicon) || {};
      const { entry: lentry } = findEntryById(leftLex, entryId);
      if (!lentry) { alert('Baseline entry not found'); return; }
      const lSense = (lentry.sense || []).find((s) => s && s.$ && String(s.$.id || s.$.order) === String(senseId));
      if (!lSense) { alert('Baseline sense not found'); return; }
      const rightLex = getLexicon ? getLexicon() : null;
      if (!rightLex) return;
      const { idx: ridx, entry: rentry } = findEntryById(rightLex, entryId);
      if (ridx < 0) { alert('Target entry not found'); return; }
      if (!Array.isArray(rentry.sense)) rentry.sense = [];
      const sidx = rentry.sense.findIndex((s) => s && s.$ && String(s.$.id || s.$.order) === String(senseId));
      const clone = JSON.parse(JSON.stringify(lSense));
      const now = new Date().toISOString();
      if (!rentry.$) rentry.$ = {};
      rentry.$.dateModified = now;
      if (sidx >= 0) rentry.sense[sidx] = clone; else rentry.sense.push(clone);
      if (onChange) onChange();
      const opts = buildDiffOptions();
      const diff = await window.pywebview.api.diff(lastPayload.left, lastPayload.right, opts);
      renderResults(diff);
    } catch (e) {
      renderError(e && e.message ? e.message : String(e));
    }
  }

  async function applyDeleteSense(entryId, senseId, leftType) {
    if (!(await ensureAllowed(leftType))) return;
    const rightLex = getLexicon ? getLexicon() : null;
    if (!rightLex) return;
    const { idx: ridx, entry: rentry } = findEntryById(rightLex, entryId);
    if (ridx < 0 || !Array.isArray(rentry.sense)) return;
    const sidx = rentry.sense.findIndex((s) => s && s.$ && String(s.$.id || s.$.order) === String(senseId));
    if (sidx >= 0) rentry.sense.splice(sidx, 1);
    const now = new Date().toISOString();
    if (!rentry.$) rentry.$ = {};
    rentry.$.dateModified = now;
    if (onChange) onChange();
    const opts = buildDiffOptions();
    const diff = await window.pywebview.api.diff(lastPayload.left, lastPayload.right, opts);
    renderResults(diff);
  }

  window.DiffViewer = { init, show, hide };
})();
