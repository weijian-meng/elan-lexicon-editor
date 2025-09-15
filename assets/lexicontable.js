// Simple table component to render lexicon entries and handle selection
// Exposes: window.LexiconTable.init({ tbody, onSelect }) and .render(entries, selectedId)
(function () {
  let tbodyEl = null;
  let onSelect = null;

  function init(opts) {
    tbodyEl = opts && opts.tbody ? opts.tbody : null;
    onSelect = opts && typeof opts.onSelect === 'function' ? opts.onSelect : null;
  }

  function render(entries, selectedId) {
    if (!tbodyEl) return;
    tbodyEl.innerHTML = '';
    if (!Array.isArray(entries)) return;

    entries.forEach((entry) => {
      try {
        const row = document.createElement('tr');
        const entryId = (entry && entry.$ && entry.$.id) || '';
        row.dataset.entryId = entryId;

        const lexicalUnitCell = document.createElement('td');
        lexicalUnitCell.className = 'col-lexical-unit';
        lexicalUnitCell.textContent = (entry['lexical-unit'] && entry['lexical-unit'][0]) || '';

        const variantsCell = document.createElement('td');
        variantsCell.className = 'col-variants';
        if (entry.variant && entry.variant.length > 0) {
          variantsCell.textContent = entry.variant.join('; ');
        } else {
          variantsCell.textContent = '';
        }

        const morphTypeCell = document.createElement('td');
        morphTypeCell.className = 'col-morph-type';
        morphTypeCell.textContent = (entry['morph-type'] && entry['morph-type'][0]) || '';

        const grammaticalCategoryCell = document.createElement('td');
        grammaticalCategoryCell.className = 'col-grammatical-category';
        grammaticalCategoryCell.textContent =
          (entry.sense && entry.sense[0] && entry.sense[0]['grammatical-category'] && entry.sense[0]['grammatical-category'][0]) || '';

        const glossCell = document.createElement('td');
        glossCell.className = 'col-gloss';
        glossCell.textContent = (entry.sense && entry.sense[0] && entry.sense[0].gloss && entry.sense[0].gloss[0]) || '';

        row.appendChild(lexicalUnitCell);
        row.appendChild(variantsCell);
        row.appendChild(morphTypeCell);
        row.appendChild(grammaticalCategoryCell);
        row.appendChild(glossCell);

        if (selectedId && entryId === selectedId) {
          row.classList.add('selected');
        }

        if (onSelect) {
          row.addEventListener('click', () => onSelect(entry));
        }

        tbodyEl.appendChild(row);
      } catch (e) {
        // Skip bad rows but continue rendering others
        console.error('Error rendering row:', e);
      }
    });
  }

  window.LexiconTable = { init, render };
})();

