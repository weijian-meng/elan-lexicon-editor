// Lexicon table renderer with clickable sort headers.
// Exposes: window.LexiconTable.init({ tbody, headers, onSelect }) and .render(entries, selectedId, { sortOrder })
(function () {
  let tbodyEl = null;
  let headerCells = [];
  let onSelect = null;

  let storedEntries = [];
  let selectedEntryId = null;
  let lexicalOrderDefinition = [];
  let lexicalOrderMap = new Map();
  let lexicalOrderMatchers = [];

  const sortState = {
    field: 'lexical-unit',
    direction: 'asc',
  };

  function init(opts) {
    tbodyEl = opts && opts.tbody ? opts.tbody : null;
    onSelect = opts && typeof opts.onSelect === 'function' ? opts.onSelect : null;

    if (opts && opts.headers) {
      headerCells = Array.from(opts.headers).filter((header) => header && header.dataset && header.dataset.field);
    } else {
      headerCells = Array.from(document.querySelectorAll('.table-header th[data-field]'));
    }

    headerCells.forEach((th) => {
      th.addEventListener('click', () => handleHeaderClick(th.dataset.field));
      th.classList.add('sortable');
    });

    updateHeaderIndicators();
  }

  function render(entries, selectedId, options) {
    if (!tbodyEl) return;

    storedEntries = Array.isArray(entries) ? entries.slice() : [];
    selectedEntryId = selectedId || null;

    applySortOrder(options && options.sortOrder);
    applySortAndRender();
  }

  function applySortOrder(sortOrderDefinition) {
    const definition = typeof sortOrderDefinition === 'string' ? sortOrderDefinition : '';
    const tokens = definition
      .split(/[\s,]+/)
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean);

    lexicalOrderDefinition = [];
    lexicalOrderMap = new Map();
    lexicalOrderMatchers = [];

    tokens.forEach((token) => {
      if (!lexicalOrderMap.has(token)) {
        lexicalOrderMap.set(token, lexicalOrderMap.size);
        lexicalOrderDefinition.push(token);
      }
    });

    lexicalOrderMatchers = lexicalOrderDefinition.slice().sort((a, b) => b.length - a.length);
  }

  function applySortAndRender() {
    if (!tbodyEl) return;
    tbodyEl.innerHTML = '';

    const sortedEntries = storedEntries.slice().sort(createComparator(sortState.field));
    if (sortState.direction === 'desc') {
      sortedEntries.reverse();
    }

    sortedEntries.forEach((entry) => {
      try {
        const row = document.createElement('tr');
        const entryId = (entry && entry.$ && entry.$.id) || '';
        row.dataset.entryId = entryId;

        const lexicalUnitCell = document.createElement('td');
        lexicalUnitCell.className = 'col-lexical-unit';
        lexicalUnitCell.textContent = getColumnValue(entry, 'lexical-unit');

        const variantsCell = document.createElement('td');
        variantsCell.className = 'col-variants';
        variantsCell.textContent = getColumnValue(entry, 'variants');

        const morphTypeCell = document.createElement('td');
        morphTypeCell.className = 'col-morph-type';
        morphTypeCell.textContent = getColumnValue(entry, 'morph-type');

        const grammaticalCategoryCell = document.createElement('td');
        grammaticalCategoryCell.className = 'col-grammatical-category';
        grammaticalCategoryCell.textContent = getColumnValue(entry, 'grammatical-category');

        const glossCell = document.createElement('td');
        glossCell.className = 'col-gloss';
        glossCell.textContent = getColumnValue(entry, 'gloss');

        row.appendChild(lexicalUnitCell);
        row.appendChild(variantsCell);
        row.appendChild(morphTypeCell);
        row.appendChild(grammaticalCategoryCell);
        row.appendChild(glossCell);

        if (selectedEntryId && entryId === selectedEntryId) {
          row.classList.add('selected');
        }

        if (onSelect) {
          row.addEventListener('click', () => onSelect(entry));
        }

        tbodyEl.appendChild(row);
      } catch (e) {
        console.error('Error rendering row:', e);
      }
    });

    updateHeaderIndicators();
  }

  function handleHeaderClick(field) {
    if (!field) return;
    const normalizedField = normalizeField(field);
    if (sortState.field === normalizedField) {
      sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
      sortState.field = normalizedField;
      sortState.direction = 'asc';
    }
    applySortAndRender();
  }

  function createComparator(field) {
    const normalizedField = normalizeField(field);
    return (a, b) => {
      const valueA = getColumnValue(a, normalizedField);
      const valueB = getColumnValue(b, normalizedField);

      const comparison = compareValues(valueA, valueB, normalizedField);
      if (comparison !== 0) return comparison;

      const fallback = compareValues(getColumnValue(a, 'lexical-unit'), getColumnValue(b, 'lexical-unit'), 'lexical-unit');
      if (fallback !== 0) return fallback;

      const idA = (a && a.$ && a.$.id) || '';
      const idB = (b && b.$ && b.$.id) || '';
      return idA.localeCompare(idB);
    };
  }

  function compareValues(valueA, valueB, field) {
    const a = (valueA || '').toString();
    const b = (valueB || '').toString();

    if (field === 'lexical-unit' && lexicalOrderDefinition.length > 0) {
      const customOrderComparison = compareWithCustomOrder(a, b);
      if (customOrderComparison !== 0) return customOrderComparison;
    }

    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  }

  function compareWithCustomOrder(a, b) {
    const keyA = buildCustomOrderKey(a);
    const keyB = buildCustomOrderKey(b);

    const length = Math.max(keyA.length, keyB.length);
    for (let i = 0; i < length; i++) {
      const valA = keyA[i];
      const valB = keyB[i];
      if (valA === undefined) return valB === undefined ? 0 : -1;
      if (valB === undefined) return 1;
      if (valA !== valB) return valA - valB;
    }
    return 0;
  }

  function buildCustomOrderKey(value) {
    const lowerValue = (value || '').toLowerCase();
    const key = [];

    for (let i = 0; i < lowerValue.length; ) {
      let matched = false;
      for (let j = 0; j < lexicalOrderMatchers.length; j++) {
        const token = lexicalOrderMatchers[j];
        if (token && lowerValue.startsWith(token, i)) {
          key.push(lexicalOrderMap.get(token));
          i += token.length;
          matched = true;
          break;
        }
      }
      if (!matched) {
        key.push(lexicalOrderDefinition.length + lowerValue.charCodeAt(i));
        i += 1;
      }
    }

    return key;
  }

  function getColumnValue(entry, field) {
    const normalizedField = normalizeField(field);
    if (!entry) return '';
    switch (normalizedField) {
      case 'lexical-unit':
        return (entry['lexical-unit'] && entry['lexical-unit'][0]) || '';
      case 'variants':
        return Array.isArray(entry.variant) && entry.variant.length > 0 ? entry.variant.join('; ') : '';
      case 'morph-type':
        return (entry['morph-type'] && entry['morph-type'][0]) || '';
      case 'grammatical-category':
        return (entry.sense && entry.sense[0] && entry.sense[0]['grammatical-category'] && entry.sense[0]['grammatical-category'][0]) || '';
      case 'gloss':
        return (entry.sense && entry.sense[0] && entry.sense[0].gloss && entry.sense[0].gloss[0]) || '';
      default:
        return '';
    }
  }

  function normalizeField(field) {
    if (!field) return '';
    return field.toString().toLowerCase();
  }

  function updateHeaderIndicators() {
    if (!Array.isArray(headerCells)) return;
    headerCells.forEach((th) => {
      if (!th || !th.dataset) return;
      const field = normalizeField(th.dataset.field);
      if (field === sortState.field) {
        th.dataset.sortDirection = sortState.direction;
      } else {
        delete th.dataset.sortDirection;
      }
    });
  }

  window.LexiconTable = { init, render };
})();
