// Config dialog component for lexicon header, fields tree, and custom fields
// Exposes: window.ConfigDialog.init({ getLexicon, onChange }), .show(), .hide()
(function () {
  let getLexicon = null;
  let onChange = null;

  // DOM refs
  let dialogEl,
    tabs,
    sections,
    fieldsTree,
    customFieldsList,
    addCustomFieldBtn,
    cancelBtn,
    saveBtn;

  function $(id) {
    return document.getElementById(id);
  }

  function init(options) {
    getLexicon = options && typeof options.getLexicon === 'function' ? options.getLexicon : null;
    onChange = options && typeof options.onChange === 'function' ? options.onChange : null;

    dialogEl = $('configDialog');
    fieldsTree = $('fieldsTree');
    customFieldsList = $('customFieldsList');
    addCustomFieldBtn = $('addCustomFieldBtn');
    cancelBtn = $('cancelConfigBtn');
    saveBtn = $('saveConfigBtn');
    tabs = document.querySelectorAll('.config-tab');
    sections = document.querySelectorAll('.config-section');

    // Tabs
    if (tabs && sections) {
      tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          const target = tab.dataset.tab;
          tabs.forEach((t) => t.classList.remove('active'));
          sections.forEach((s) => s.classList.remove('active'));
          tab.classList.add('active');
          const section = document.getElementById(`${target}Section`);
          if (section) section.classList.add('active');
        });
      });
    }

    if (addCustomFieldBtn) addCustomFieldBtn.addEventListener('click', handleAddCustomField);
    if (cancelBtn) cancelBtn.addEventListener('click', hide);
    if (saveBtn) saveBtn.addEventListener('click', handleSaveConfig);
  }

  function show() {
    const lexicon = getLexicon ? getLexicon() : null;
    if (!lexicon) {
      alert('Please create or open a lexicon first.');
      return;
    }

    const header = Array.isArray(lexicon.header) ? lexicon.header[0] : lexicon.header;
    if (!header) return;

    $('configName').value = (header.name && header.name[0]) || '';
    $('configLanguage').value = (header.language && header.language[0]) || '';
    $('configDescription').value = (header.description && header.description[0]) || '';
    $('configAuthor').value = (header.author && header.author[0]) || '';
    $('configVersion').value = (header.version && header.version[0]) || '';

    renderFieldsTree(header);
    renderCustomFields(header);
    const sortOrderEl = $('sortOrder');
    if (sortOrderEl) sortOrderEl.value = (header['sort-order'] && header['sort-order'][0]) || '';

    if (dialogEl) dialogEl.classList.remove('hidden');
  }

  function hide() {
    if (dialogEl) dialogEl.classList.add('hidden');
  }

  function renderFieldsTree(header) {
    if (!fieldsTree) return;
    fieldsTree.innerHTML = '';

    const entryNode = createTreeItem('entry', 'root');
    fieldsTree.appendChild(entryNode);

    const entryFields = ['lexical-unit', 'morph-type'];
    entryFields.forEach((f) => {
      const el = createTreeItem(f, 'entry');
      entryNode.querySelector('.tree-item-children').appendChild(el);
    });

    const senseNode = createTreeItem('sense', 'entry');
    entryNode.querySelector('.tree-item-children').appendChild(senseNode);
    const senseFields = ['grammatical-category', 'gloss'];
    senseFields.forEach((f) => {
      const el = createTreeItem(f, 'sense');
      senseNode.querySelector('.tree-item-children').appendChild(el);
    });

    if (header['custom-fields'] && header['custom-fields'][0]) {
      const container = header['custom-fields'][0];
      if (Array.isArray(container['field-spec'])) {
        container['field-spec'].forEach((field) => {
          if (field && field.$) {
            const el = createTreeItem(`${field.$.name} (custom)`, field.$.level || 'entry');
            if (field.$.level === 'sense') {
              senseNode.querySelector('.tree-item-children').appendChild(el);
            } else {
              entryNode.querySelector('.tree-item-children').appendChild(el);
            }
          }
        });
      } else if (container['field-spec'] && container['field-spec'].$) {
        const field = container['field-spec'];
        const el = createTreeItem(`${field.$.name} (custom)`, field.$.level || 'entry');
        if (field.$.level === 'sense') {
          senseNode.querySelector('.tree-item-children').appendChild(el);
        } else {
          entryNode.querySelector('.tree-item-children').appendChild(el);
        }
      }
    }
  }

  function createTreeItem(name, level) {
    const div = document.createElement('div');
    div.className = 'tree-item';
    const content = document.createElement('div');
    content.className = 'tree-item-content';
    const icon = document.createElement('span');
    icon.className = 'tree-item-icon';
    icon.onclick = () => {
      const children = div.querySelector('.tree-item-children');
      if (children) {
        children.style.display = children.style.display === 'none' ? 'block' : 'none';
        icon.textContent = children.style.display === 'none' ? '▶' : '▼';
      }
    };
    const label = document.createElement('span');
    label.className = 'tree-item-label';
    label.textContent = name;
    content.appendChild(icon);
    content.appendChild(label);
    div.appendChild(content);
    if (level !== 'leaf') {
      const children = document.createElement('div');
      children.className = 'tree-item-children';
      div.appendChild(children);
    }
    return div;
  }

  function renderCustomFields(header) {
    if (!customFieldsList) return;
    customFieldsList.innerHTML = '';
    if (header['custom-fields'] && header['custom-fields'][0]) {
      const container = header['custom-fields'][0];
      if (Array.isArray(container['field-spec'])) {
        container['field-spec'].forEach((field) => {
          if (field && field.$) customFieldsList.appendChild(createCustomFieldElement({ name: field.$.name || '', level: field.$.level || 'entry' }));
        });
      } else if (container['field-spec'] && container['field-spec'].$) {
        const field = container['field-spec'];
        customFieldsList.appendChild(createCustomFieldElement({ name: field.$.name || '', level: field.$.level || 'entry' }));
      }
    }
  }

  function createCustomFieldElement(field) {
    const div = document.createElement('div');
    div.className = 'custom-field';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = field.name || '';
    nameInput.placeholder = 'Field name';
    const levelSelect = document.createElement('select');
    levelSelect.innerHTML = `
      <option value="entry" ${field.level === 'entry' ? 'selected' : ''}>Entry</option>
      <option value="sense" ${field.level === 'sense' ? 'selected' : ''}>Sense</option>
    `;
    const removeButton = document.createElement('button');
    removeButton.textContent = 'Remove';
    removeButton.className = 'button danger';
    removeButton.onclick = () => div.remove();
    div.appendChild(nameInput);
    div.appendChild(levelSelect);
    div.appendChild(removeButton);
    return div;
  }

  function handleAddCustomField() {
    if (!customFieldsList) return;
    const el = createCustomFieldElement({ name: '', level: 'entry' });
    customFieldsList.appendChild(el);
  }

  function handleSaveConfig() {
    const lexicon = getLexicon ? getLexicon() : null;
    if (!lexicon) return;
    const header = Array.isArray(lexicon.header) ? lexicon.header[0] : lexicon.header;
    if (!header) return;

    const nameInput = $('configName');
    const languageInput = $('configLanguage');
    const descriptionInput = $('configDescription');
    const authorInput = $('configAuthor');
    const versionInput = $('configVersion');
    const sortOrderInput = $('sortOrder');
    if (nameInput && nameInput.value) header.name = [nameInput.value];
    if (languageInput && languageInput.value) header.language = [languageInput.value];
    if (descriptionInput && descriptionInput.value) header.description = [descriptionInput.value];
    if (authorInput && authorInput.value) header.author = [authorInput.value];
    if (versionInput && versionInput.value) header.version = [versionInput.value];
    if (sortOrderInput && sortOrderInput.value) header['sort-order'] = [sortOrderInput.value];

    const fieldSpecs = [];
    if (customFieldsList) {
      customFieldsList.querySelectorAll('.custom-field').forEach((fieldElement) => {
        const nameInput = fieldElement.querySelector('input');
        const levelSelect = fieldElement.querySelector('select');
        let fieldName = nameInput ? nameInput.value : '';
        fieldName = (fieldName || '').replace(/[^a-zA-Z0-9_]/g, '_');
        if (fieldName) {
          fieldSpecs.push({ $: { name: fieldName, level: levelSelect ? levelSelect.value : 'entry' }, _: '' });
        }
      });
    }

    if (!header['custom-fields']) header['custom-fields'] = [{}];
    if (!header['custom-fields'][0]) header['custom-fields'][0] = {};
    header['custom-fields'][0]['field-spec'] = fieldSpecs.length > 0 ? fieldSpecs : [];

    if (typeof onChange === 'function') onChange();
    hide();
  }

  window.ConfigDialog = { init, show, hide };
})();

