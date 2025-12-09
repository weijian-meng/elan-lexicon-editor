// Entry editor component to render and edit a single entry
// Exposes: window.EntryEditor.init({ getLexicon, onChange }) and .load(entry), .clear()
(function () {
  let getLexicon = null;
  let onChange = null;

  // DOM refs
  let refs = {};
  let selectedEntry = null;
  const AUTOCOMPLETE_IDS = {
    morphType: 'morphTypeOptions',
    grammaticalCategory: 'grammaticalCategoryOptions',
  };
  const datalistRefs = {};

  function $(id) { return document.getElementById(id); }

  // Ensure there is a datalist element for the given id
  function ensureDatalist(id) {
    if (datalistRefs[id]) return datalistRefs[id];
    const dl = document.createElement('datalist');
    dl.id = id;
    document.body.appendChild(dl);
    datalistRefs[id] = dl;
    return dl;
  }

  // Replace the contents of a datalist with the provided values
  function setDatalistOptions(dl, values) {
    if (!dl) return;
    dl.innerHTML = '';
    values.forEach((val) => {
      const opt = document.createElement('option');
      opt.value = val;
      dl.appendChild(opt);
    });
  }

  function attachAutocomplete(input, datalistId) {
    if (!input) return;
    ensureDatalist(datalistId);
    input.setAttribute('list', datalistId);
    input.setAttribute('autocomplete', 'off');
  }

  function collectEntryFieldValues(fieldName) {
    const lexicon = getLexicon ? getLexicon() : null;
    if (!lexicon || !Array.isArray(lexicon.entry)) return [];
    const values = new Set();
    lexicon.entry.forEach((entry) => {
      const fieldVal = entry && entry[fieldName];
      if (Array.isArray(fieldVal)) {
        fieldVal.forEach((v) => {
          const text = typeof v === 'string' ? v : (v && v._) || '';
          const normalized = text.trim();
          if (normalized) values.add(normalized);
        });
      } else if (typeof fieldVal === 'string') {
        const normalized = fieldVal.trim();
        if (normalized) values.add(normalized);
      }
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }

  function collectSenseFieldValues(fieldName) {
    const lexicon = getLexicon ? getLexicon() : null;
    if (!lexicon || !Array.isArray(lexicon.entry)) return [];
    const values = new Set();
    lexicon.entry.forEach((entry) => {
      const senses = entry && Array.isArray(entry.sense) ? entry.sense : [];
      senses.forEach((sense) => {
        const fieldVal = sense && sense[fieldName];
        if (Array.isArray(fieldVal)) {
          fieldVal.forEach((v) => {
            const text = typeof v === 'string' ? v : (v && v._) || '';
            const normalized = text.trim();
            if (normalized) values.add(normalized);
          });
        } else if (typeof fieldVal === 'string') {
          const normalized = fieldVal.trim();
          if (normalized) values.add(normalized);
        }
      });
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }

  // Refresh the shared datalists so morph-type and grammatical-category inputs can suggest existing values
  function refreshAutocompleteOptions() {
    const morphOptions = collectEntryFieldValues('morph-type');
    const morphDatalist = ensureDatalist(AUTOCOMPLETE_IDS.morphType);
    setDatalistOptions(morphDatalist, morphOptions);

    const gramOptions = collectSenseFieldValues('grammatical-category');
    const gramDatalist = ensureDatalist(AUTOCOMPLETE_IDS.grammaticalCategory);
    setDatalistOptions(gramDatalist, gramOptions);

    attachAutocomplete(refs.morphTypeInput, AUTOCOMPLETE_IDS.morphType);
  }

  function init(options) {
    getLexicon = options && typeof options.getLexicon === 'function' ? options.getLexicon : null;
    onChange = options && typeof options.onChange === 'function' ? options.onChange : null;

    refs.entryDetails = $('entryDetails');
    refs.emptySelection = $('emptySelection');
    refs.lexicalUnitInput = $('lexicalUnit');
    refs.morphTypeInput = $('morphType');
    refs.sensesContainer = $('sensesContainer');
    refs.addSenseBtn = $('addSenseBtn');
    refs.entryIdInput = $('entryId');
    refs.dateCreatedInput = $('dateCreated');
    refs.dateModifiedInput = $('dateModified');
    refs.variantsContainer = $('variantsContainer');
    refs.addVariantBtn = $('addVariantBtn');
    refs.entryHeader = refs.entryDetails ? refs.entryDetails.querySelector('.entry-header h2') : null;

    if (refs.addSenseBtn) refs.addSenseBtn.onclick = handleAddSense;
    if (refs.addVariantBtn) refs.addVariantBtn.onclick = handleAddVariant;

    ensureDatalist(AUTOCOMPLETE_IDS.morphType);
    ensureDatalist(AUTOCOMPLETE_IDS.grammaticalCategory);
  }

  function updateEntryHeading() {
    if (!refs.entryHeader || !selectedEntry) return;
    
    const lexicalUnit = (selectedEntry['lexical-unit'] && selectedEntry['lexical-unit'][0]) || '';
    if (lexicalUnit.trim()) {
      refs.entryHeader.textContent = `Entry: ${lexicalUnit}`;
    } else {
      refs.entryHeader.textContent = 'Entry Details';
    }
  }

  function markChanged() {
    if (selectedEntry && selectedEntry.$) {
      selectedEntry.$.dateModified = new Date().toISOString();
    }
    if (onChange) onChange();
  }

  function clear() {
    selectedEntry = null;
    if (refs.emptySelection) refs.emptySelection.classList.remove('hidden');
    if (refs.entryDetails) refs.entryDetails.classList.add('hidden');
    // Remove any custom field elements
    if (refs.entryDetails) {
      refs.entryDetails.querySelectorAll('.custom-field-group').forEach((g) => g.remove());
    }
    if (refs.sensesContainer) refs.sensesContainer.innerHTML = '';
    if (refs.variantsContainer) refs.variantsContainer.innerHTML = '';
  }

  function handleAddVariant() {
    if (!selectedEntry) return;
    if (!selectedEntry.variant) selectedEntry.variant = [];
    selectedEntry.variant.push('');
    renderEntryForm();
    markChanged();
  }

  function handleRemoveVariant(index) {
    if (!selectedEntry || !selectedEntry.variant) return;
    selectedEntry.variant.splice(index, 1);
    renderEntryForm();
    markChanged();
  }

  function handleVariantChange(index, value) {
    if (!selectedEntry) return;
    if (!selectedEntry.variant) selectedEntry.variant = [];
    selectedEntry.variant[index] = value;
    updateEntryFromForm();
  }

  function handleAddSense() {
    if (!selectedEntry) return;
    const order = selectedEntry.sense ? String(selectedEntry.sense.length + 1) : '1';
    const newSense = {
      $: { id: `s_${(window.crypto && crypto.randomUUID && crypto.randomUUID()) || Math.random().toString(36).slice(2)}`, order },
      'grammatical-category': [''],
      gloss: [''],
    };
    if (!selectedEntry.sense) selectedEntry.sense = [];
    selectedEntry.sense.push(newSense);
    renderEntryForm();
    markChanged();
  }

  function updateEntryFromForm() {
    if (!selectedEntry || !refs.entryDetails) return;

    selectedEntry['lexical-unit'] = [refs.lexicalUnitInput.value];
    selectedEntry['morph-type'] = [refs.morphTypeInput.value];

    // Update custom entry fields (standard and field@name) not tied to senses
    refs.entryDetails
      .querySelectorAll('.custom-field-input:not([data-sense-index])')
      .forEach((input) => {
        const fieldName = input.dataset.fieldName;
        if (!fieldName) return;

        if (fieldName === 'field') {
          const nameAttr = input.dataset.customName;
          if (!nameAttr) return;
          if (!Array.isArray(selectedEntry.field)) selectedEntry.field = [];
          let idx = selectedEntry.field.findIndex((f) => f && f.$ && f.$.name === nameAttr);
          if (idx >= 0) {
            selectedEntry.field[idx]._ = input.value;
          } else {
            selectedEntry.field.push({ $: { name: nameAttr }, _: input.value });
          }
        } else {
          selectedEntry[fieldName] = [input.value];
        }
      });

    // Update senses from DOM
    const senseEls = refs.sensesContainer.querySelectorAll('.sense-section');
    senseEls.forEach((senseEl, index) => {
      const gci = senseEl.querySelector('.grammatical-category');
      const gi = senseEl.querySelector('.gloss');
      if (!selectedEntry.sense[index]) return;
      selectedEntry.sense[index]['grammatical-category'] = [gci ? gci.value : ''];
      selectedEntry.sense[index].gloss = [gi ? gi.value : ''];

      // Custom sense fields
      senseEl.querySelectorAll('.custom-field-input[data-sense-index]').forEach((input) => {
        const fieldName = input.dataset.fieldName;
        if (!fieldName) return;
        if (fieldName === 'field') {
          const nameAttr = input.dataset.customName;
          if (!Array.isArray(selectedEntry.sense[index].field)) selectedEntry.sense[index].field = [];
          const sIdx = selectedEntry.sense[index].field.findIndex((f) => f && f.$ && f.$.name === nameAttr);
          if (sIdx >= 0) {
            selectedEntry.sense[index].field[sIdx]._ = input.value;
          } else {
            selectedEntry.sense[index].field.push({ $: { name: nameAttr }, _: input.value });
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
    if (!lexicon || !lexicon.header || !selectedEntry || !refs.entryDetails) return;

    const header = Array.isArray(lexicon.header) ? lexicon.header[0] : lexicon.header;
    if (!header['custom-fields'] || !header['custom-fields'][0]) return;
    const customFieldsContainer = header['custom-fields'][0];
    let customFields = [];

    if (Array.isArray(customFieldsContainer['field-spec'])) {
      customFields = customFieldsContainer['field-spec'].filter((f) => f && f.$ && f.$.level === 'entry');
    } else if (
      customFieldsContainer['field-spec'] &&
      customFieldsContainer['field-spec'].$ &&
      customFieldsContainer['field-spec'].$.level === 'entry'
    ) {
      customFields = [customFieldsContainer['field-spec']];
    }

    customFields.forEach((field) => {
      if (!field || !field.$) return;
      const fieldName = field.$.name;
      if (!fieldName) return;

      const existingField = refs.entryDetails.querySelector(`#custom_${fieldName}`);
      if (existingField) return;

      const formGroup = document.createElement('div');
      formGroup.className = 'form-group custom-field-group';

      const label = document.createElement('label');
      label.textContent = fieldName.replace(/_/g, ' ');

      const input = document.createElement('input');
      input.type = 'text';
      input.id = `custom_${fieldName}`;
      input.className = 'custom-field-input';
      input.dataset.fieldName = fieldName;

      if (fieldName === 'field') {
        const customName = (field.$ && field.$.nameAttr) || field.$.name;
        input.dataset.customName = customName;
      }

      input.value = selectedEntry[fieldName] && selectedEntry[fieldName].length > 0 ? selectedEntry[fieldName][0] : '';
      input.onchange = () => updateEntryFromForm();

      formGroup.appendChild(label);
      formGroup.appendChild(input);

      const sensesContainer = refs.sensesContainer;
      const addSenseBtn = refs.addSenseBtn;
      if (addSenseBtn) {
        refs.entryDetails.insertBefore(formGroup, addSenseBtn);
      } else if (sensesContainer) {
        refs.entryDetails.insertBefore(formGroup, sensesContainer.nextSibling);
      } else {
        const idField = refs.entryDetails.querySelector('#entryId');
        if (idField && idField.closest('.form-group')) {
          refs.entryDetails.insertBefore(formGroup, idField.closest('.form-group'));
        } else {
          refs.entryDetails.appendChild(formGroup);
        }
      }
    });

    // Add fields existing on entry not in header definition (excluding standard ones)
    const standardFields = ['$', 'lexical-unit', 'morph-type', 'sense', 'variant'];
    Object.keys(selectedEntry).forEach((key) => {
      if (standardFields.includes(key)) return;
      if (key === 'field') return;
      const existingField = refs.entryDetails.querySelector(`#custom_${key}`);
      if (existingField) return;
      const isDefined = customFields.some((f) => f.$.name === key);
      if (isDefined) return;

      const formGroup = document.createElement('div');
      formGroup.className = 'form-group custom-field-group';
      formGroup.dataset.fieldName = key;

      const label = document.createElement('label');
      label.textContent = key.replace(/_/g, ' ');

      const input = document.createElement('input');
      input.type = 'text';
      input.id = `custom_${key}`;
      input.className = 'custom-field-input';
      input.dataset.fieldName = key;
      input.value = selectedEntry[key] && selectedEntry[key].length > 0 ? selectedEntry[key][0] : '';
      input.onchange = () => updateEntryFromForm();

      formGroup.appendChild(label);
      formGroup.appendChild(input);

      const sensesContainer = refs.sensesContainer;
      const addSenseBtn = refs.addSenseBtn;
      if (addSenseBtn) {
        refs.entryDetails.insertBefore(formGroup, addSenseBtn);
      } else if (sensesContainer) {
        refs.entryDetails.insertBefore(formGroup, sensesContainer.nextSibling);
      } else {
        const idField = refs.entryDetails.querySelector('#entryId');
        if (idField && idField.closest('.form-group')) {
          refs.entryDetails.insertBefore(formGroup, idField.closest('.form-group'));
        } else {
          refs.entryDetails.appendChild(formGroup);
        }
      }
    });

    // field@name style
    if (selectedEntry.field) {
      const fieldElements = Array.isArray(selectedEntry.field) ? selectedEntry.field : [selectedEntry.field];
      fieldElements.forEach((field) => {
        if (!field || !field.$ || !field.$.name) return;
        const fieldName = field.$.name;
        const existingField = refs.entryDetails.querySelector(`#custom_${fieldName}`);
        if (existingField) return;
        const isDefined = customFields.some((f) => f.$.name === fieldName);
        if (isDefined) return;

        const formGroup = document.createElement('div');
        formGroup.className = 'form-group custom-field-group';
        formGroup.dataset.fieldName = fieldName;

        const label = document.createElement('label');
        label.textContent = fieldName.replace(/_/g, ' ');

        const input = document.createElement('input');
        input.type = 'text';
        input.id = `custom_${fieldName}`;
        input.className = 'custom-field-input';
        input.dataset.fieldName = 'field';
        input.dataset.customName = fieldName;
        input.value = field._ || '';
        input.onchange = () => updateEntryFromForm();

        formGroup.appendChild(label);
        formGroup.appendChild(input);

        const sensesContainer = refs.sensesContainer;
        const addSenseBtn = refs.addSenseBtn;
        if (addSenseBtn) {
          refs.entryDetails.insertBefore(formGroup, addSenseBtn);
        } else if (sensesContainer) {
          refs.entryDetails.insertBefore(formGroup, sensesContainer.nextSibling);
        } else {
          const idField = refs.entryDetails.querySelector('#entryId');
          if (idField && idField.closest('.form-group')) {
            refs.entryDetails.insertBefore(formGroup, idField.closest('.form-group'));
          } else {
            refs.entryDetails.appendChild(formGroup);
          }
        }
      });
    }
  }

  function renderCustomSenseFields(sense, senseSection, senseIndex) {
    const lexicon = getLexicon ? getLexicon() : null;
    if (!lexicon || !lexicon.header) return;
    const header = Array.isArray(lexicon.header) ? lexicon.header[0] : lexicon.header;
    if (!header['custom-fields'] || !header['custom-fields'][0]) return;
    const customFieldsContainer = header['custom-fields'][0];
    let customFields = [];

    if (Array.isArray(customFieldsContainer['field-spec'])) {
      customFields = customFieldsContainer['field-spec'].filter((f) => f && f.$ && f.$.level === 'sense');
    } else if (
      customFieldsContainer['field-spec'] &&
      customFieldsContainer['field-spec'].$ &&
      customFieldsContainer['field-spec'].$.level === 'sense'
    ) {
      customFields = [customFieldsContainer['field-spec']];
    }

    customFields.forEach((field) => {
      if (!field || !field.$) return;
      const fieldName = field.$.name;
      if (!fieldName) return;

      const formGroup = document.createElement('div');
      formGroup.className = 'form-group custom-field-group';
      formGroup.dataset.fieldName = fieldName;

      const label = document.createElement('label');
      label.textContent = fieldName.replace(/_/g, ' ');

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'custom-field-input';
      input.dataset.fieldName = fieldName;
      input.dataset.senseIndex = senseIndex;

      if (fieldName === 'field') {
        const customName = (field.$ && field.$.nameAttr) || field.$.name;
        input.dataset.fieldName = 'field';
        input.dataset.customName = customName;
      }

      input.value = sense[fieldName] && sense[fieldName].length > 0 ? sense[fieldName][0] : '';
      input.onchange = () => updateEntryFromForm();

      formGroup.appendChild(label);
      formGroup.appendChild(input);
      senseSection.appendChild(formGroup);
    });

    // Add ad-hoc fields on sense not in header
    const standardFields = ['$', 'grammatical-category', 'gloss'];
    Object.keys(sense).forEach((key) => {
      if (standardFields.includes(key)) return;
      if (key === 'field') return;
      const isDefined = customFields.some((f) => f.$.name === key);
      if (isDefined) return;

      const formGroup = document.createElement('div');
      formGroup.className = 'form-group custom-field-group';
      formGroup.dataset.fieldName = key;

      const label = document.createElement('label');
      label.textContent = key.replace(/_/g, ' ');

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'custom-field-input';
      input.dataset.fieldName = key;
      input.dataset.senseIndex = senseIndex;
      input.value = sense[key] && sense[key].length > 0 ? sense[key][0] : '';
      input.onchange = () => updateEntryFromForm();

      formGroup.appendChild(label);
      formGroup.appendChild(input);
      senseSection.appendChild(formGroup);
    });

    // field@name on sense
    if (sense.field) {
      const fieldElements = Array.isArray(sense.field) ? sense.field : [sense.field];
      fieldElements.forEach((field) => {
        if (!field || !field.$ || !field.$.name) return;
        const fieldName = field.$.name;
        const isDefined = customFields.some((f) => f.$.name === fieldName);
        if (isDefined) return;

        const formGroup = document.createElement('div');
        formGroup.className = 'form-group custom-field-group';
        formGroup.dataset.fieldName = fieldName;

        const label = document.createElement('label');
        label.textContent = fieldName.replace(/_/g, ' ');

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'custom-field-input';
        input.dataset.fieldName = 'field';
        input.dataset.customName = fieldName;
        input.dataset.senseIndex = senseIndex;
        input.value = field._ || '';
        input.onchange = () => updateEntryFromForm();

        formGroup.appendChild(label);
        formGroup.appendChild(input);
        senseSection.appendChild(formGroup);
      });
    }
  }

  function renderEntryForm() {
    if (!selectedEntry) {
      if (refs.emptySelection) refs.emptySelection.classList.add('hidden');
      if (refs.entryDetails) refs.entryDetails.classList.add('hidden');
      return;
    }

    if (refs.emptySelection) refs.emptySelection.classList.add('hidden');
    if (refs.entryDetails) refs.entryDetails.classList.remove('hidden');

    refreshAutocompleteOptions();

    // Standard fields
    refs.lexicalUnitInput.value = (selectedEntry['lexical-unit'] && selectedEntry['lexical-unit'][0]) || '';
    refs.morphTypeInput.value = (selectedEntry['morph-type'] && selectedEntry['morph-type'][0]) || '';
    attachAutocomplete(refs.morphTypeInput, AUTOCOMPLETE_IDS.morphType);
    refs.entryIdInput.value = (selectedEntry.$ && selectedEntry.$.id) || '';
    refs.dateCreatedInput.value = (selectedEntry.$ && selectedEntry.$.dateCreated) || '';
    refs.dateModifiedInput.value = (selectedEntry.$ && selectedEntry.$.dateModified) || '';

    refs.lexicalUnitInput.onchange = updateEntryFromForm;
    refs.morphTypeInput.onchange = updateEntryFromForm;

    // Variants
    if (refs.variantsContainer) refs.variantsContainer.innerHTML = '';
    if (selectedEntry.variant) {
      selectedEntry.variant.forEach((variant, index) => {
        const variantGroup = document.createElement('div');
        variantGroup.className = 'variant-group';
        variantGroup.style.display = 'flex';
        variantGroup.style.gap = '10px';
        variantGroup.style.marginBottom = '10px';

        const variantInput = document.createElement('input');
        variantInput.type = 'text';
        variantInput.value = variant;
        variantInput.className = 'variant-input';
        variantInput.style.flex = '1';
        variantInput.onchange = (e) => handleVariantChange(index, e.target.value);

        const removeButton = document.createElement('button');
        removeButton.textContent = 'Remove';
        removeButton.className = 'button danger';
        removeButton.onclick = () => handleRemoveVariant(index);

        variantGroup.appendChild(variantInput);
        variantGroup.appendChild(removeButton);
        refs.variantsContainer.appendChild(variantGroup);
      });
    }

    // Senses
    if (refs.sensesContainer) refs.sensesContainer.innerHTML = '';
    (selectedEntry.sense || []).forEach((sense, index) => {
      const senseSection = document.createElement('div');
      senseSection.className = 'sense-section';

      const senseHeader = document.createElement('div');
      senseHeader.className = 'sense-header';

      const senseTitle = document.createElement('h3');
      senseTitle.textContent = `Sense ${index + 1}`;

      const removeButton = document.createElement('button');
      removeButton.textContent = 'Remove';
      removeButton.className = 'button danger';
      removeButton.disabled = (selectedEntry.sense || []).length <= 1;
      removeButton.onclick = () => {
        selectedEntry.sense = (selectedEntry.sense || []).filter((_, i) => i !== index);
        renderEntryForm();
        markChanged();
      };

      senseHeader.appendChild(senseTitle);
      senseHeader.appendChild(removeButton);

      const senseIdGroup = document.createElement('div');
      senseIdGroup.className = 'form-group';
      const senseIdLabel = document.createElement('label');
      senseIdLabel.textContent = 'ID';
      const senseIdInput = document.createElement('input');
      senseIdInput.type = 'text';
      senseIdInput.value = (sense.$ && sense.$.id) || '';
      senseIdInput.disabled = true;
      senseIdGroup.appendChild(senseIdLabel);
      senseIdGroup.appendChild(senseIdInput);

      const grammaticalCategoryGroup = document.createElement('div');
      grammaticalCategoryGroup.className = 'form-group';
      const grammaticalCategoryLabel = document.createElement('label');
      grammaticalCategoryLabel.textContent = 'Grammatical Category';
      const grammaticalCategoryInput = document.createElement('input');
      grammaticalCategoryInput.type = 'text';
      grammaticalCategoryInput.className = 'grammatical-category';
      grammaticalCategoryInput.value = (sense['grammatical-category'] && sense['grammatical-category'][0]) || '';
      attachAutocomplete(grammaticalCategoryInput, AUTOCOMPLETE_IDS.grammaticalCategory);
      grammaticalCategoryInput.onchange = updateEntryFromForm;
      grammaticalCategoryGroup.appendChild(grammaticalCategoryLabel);
      grammaticalCategoryGroup.appendChild(grammaticalCategoryInput);

      const glossGroup = document.createElement('div');
      glossGroup.className = 'form-group';
      const glossLabel = document.createElement('label');
      glossLabel.textContent = 'Gloss';
      const glossInput = document.createElement('input');
      glossInput.type = 'text';
      glossInput.className = 'gloss';
      glossInput.value = (sense.gloss && sense.gloss[0]) || '';
      glossInput.onchange = updateEntryFromForm;
      glossGroup.appendChild(glossLabel);
      glossGroup.appendChild(glossInput);

      senseSection.appendChild(senseHeader);
      senseSection.appendChild(senseIdGroup);
      senseSection.appendChild(grammaticalCategoryGroup);
      senseSection.appendChild(glossGroup);

      // Custom sense-level fields
      renderCustomSenseFields(sense, senseSection, index);

      refs.sensesContainer.appendChild(senseSection);
    });

    // Custom entry-level fields after base sections
    renderCustomEntryFields();
    
    // Update the heading to show the lexical unit
    updateEntryHeading();
  }

  function load(entry) {
    selectedEntry = entry || null;
    if (!selectedEntry) {
      clear();
      return;
    }
    renderEntryForm();
  }

  window.EntryEditor = { init, load, clear };
})();
