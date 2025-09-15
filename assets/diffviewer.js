// Diff viewer component: opens a dialog, lets user pick sources, calls backend diff, and renders results
(function () {
  let getLexicon = null;
  let getCurrentFile = null;

  function $(id) { return document.getElementById(id); }

  function init(options) {
    getLexicon = options && options.getLexicon;
    getCurrentFile = options && options.getCurrentFile;

    const openBtn = $('diffBtn');
    const dlg = $('diffDialog');
    const closeBtn = $('diffCloseBtn');
    const runBtn = $('diffRunBtn');
    const ignoreTimestamps = $('diffIgnoreTimestamps');

    if (openBtn) openBtn.addEventListener('click', () => show());
    if (closeBtn) closeBtn.addEventListener('click', () => hide());
    if (dlg) dlg.addEventListener('click', (e) => { if (e.target === dlg) hide(); });
    if (runBtn) runBtn.addEventListener('click', async () => {
      clearResults();
      const mode = (document.querySelector('input[name="diffMode"]:checked') || {}).value;
      const ignoreTs = !!(ignoreTimestamps && ignoreTimestamps.checked);
      try {
        const payload = buildDiffPayload(mode, ignoreTs);
        if (!payload) return;
        const diff = await window.pywebview.api.diff(payload.left, payload.right, { ignore_timestamps: ignoreTs });
        renderResults(diff);
      } catch (e) {
        renderError(e && e.message ? e.message : String(e));
      }
    });
  }

  function buildDiffPayload(mode, ignoreTs) {
    const lexicon = getLexicon ? getLexicon() : null;
    const path = getCurrentFile ? getCurrentFile() : null;
    if (!lexicon) {
      alert('No lexicon loaded');
      return null;
    }
    if ((mode === 'working-vs-disk' || mode === 'working-vs-head') && !path) {
      alert('No file path. Please save or open a file first.');
      return null;
    }
    // IMPORTANT: The diff backend reports `added` as items present in RIGHT but not in LEFT.
    // We want "Added" to reflect items added in the working copy, so we set:
    //   LEFT = baseline (disk or HEAD), RIGHT = working (in-memory)
    if (mode === 'working-vs-disk') {
      return {
        left: { type: 'disk', path },
        right: { type: 'object', data: { lexicon } },
      };
    }
    if (mode === 'working-vs-head') {
      return {
        left: { type: 'git', path, rev: 'HEAD' },
        right: { type: 'object', data: { lexicon } },
      };
    }
    return null;
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

    // Added entries
    if (entries.added && entries.added.length) {
      const h = document.createElement('h4');
      h.textContent = 'Added Entries';
      section.appendChild(h);
      const ul = document.createElement('ul');
      entries.added.forEach((id) => {
        const li = document.createElement('li');
        li.textContent = id;
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
        li.textContent = id;
        ul.appendChild(li);
      });
      section.appendChild(ul);
    }

    // Modified entries
    if (entries.modified && entries.modified.length) {
      const h = document.createElement('h4');
      h.textContent = 'Modified Entries';
      section.appendChild(h);
      entries.modified.forEach((m) => section.appendChild(renderModifiedEntry(m)));
    }

    out.appendChild(section);
  }

  function renderModifiedEntry(m) {
    const wrap = document.createElement('div');
    wrap.className = 'diff-entry';
    const title = document.createElement('div');
    title.className = 'diff-entry-title';
    title.textContent = `Entry ${m.id} ${m.lexical_unit ? '(' + m.lexical_unit + ')' : ''}`;
    wrap.appendChild(title);

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
        const p = document.createElement('div');
        p.textContent = `Added senses: ${s.added.join(', ')}`;
        wrap.appendChild(p);
      }
      if (s.removed && s.removed.length) {
        const p = document.createElement('div');
        p.textContent = `Removed senses: ${s.removed.join(', ')}`;
        wrap.appendChild(p);
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
          list.appendChild(item);
        });
        wrap.appendChild(list);
      }
    }
    return wrap;
  }

  window.DiffViewer = { init, show, hide };
})();
