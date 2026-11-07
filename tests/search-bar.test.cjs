const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function compile(path) {
  return ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
}

const textApi = { exports: {} };
new Function('exports', compile('ui/src/elanText.ts'))(textApi.exports);
const compiled = compile('ui/src/SearchBar.ts');

function element() {
  const listeners = {};
  const classes = new Set(['hidden']);
  return {
    value: '', checked: false, dataset: {}, children: [],
    classList: {
      contains: name => classes.has(name),
      add: name => classes.add(name),
      remove: name => classes.delete(name),
      toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
    },
    set innerHTML(value) { this.children = []; },
    appendChild(child) { this.children.push(child); },
    addEventListener(name, listener) { listeners[name] = listener; },
    setAttribute() {}, focus() {},
    fire(name) { listeners[name](); },
  };
}

function harness(lexicon) {
  const elements = Object.fromEntries([
    'searchInput', 'searchCaseToggle', 'searchRegexToggle', 'searchWordToggle',
    'searchFieldsBtn', 'searchFieldsPopover', 'searchFieldAll', 'searchFieldsList',
  ].map(id => [id, element()]));
  const context = {
    exports: {}, require: () => textApi.exports,
    document: {
      getElementById: id => elements[id], createElement: element,
      addEventListener() {}, removeEventListener() {},
    },
  };
  vm.createContext(context);
  vm.runInContext(compiled, context);
  let matcher = null;
  context.exports.init({ getLexicon: () => lexicon, onFilterChange: value => { matcher = value; } });
  elements.searchFieldsBtn.fire('click');
  const checkboxes = () => elements.searchFieldsList.children.map(label => label.children[0]);
  function toggle(name, checked) {
    const checkbox = name === null ? elements.searchFieldAll
      : checkboxes().find(input => input.dataset.fieldName === name);
    assert.ok(checkbox, `Missing field checkbox: ${name}`);
    checkbox.checked = checked;
    checkbox.fire('change');
  }
  return {
    elements, toggle,
    fields: () => checkboxes().map(input => input.dataset.fieldName),
    select(...names) {
      toggle(null, false);
      for (const checkbox of checkboxes()) toggle(checkbox.dataset.fieldName, names.includes(checkbox.dataset.fieldName));
    },
    search(query) { elements.searchInput.value = query; elements.searchInput.fire('input'); },
    matches: entry => matcher === null || matcher(entry),
  };
}

const named = (name, text) => ({ $: { name }, _: text });

test('selector discovers declared and undeclared custom names without a container option', () => {
  const app = harness({
    header: [{ 'custom-fields': [{ 'field-spec': [
      { $: { name: 'empty', level: 'entry' } },
      { $: { name: 'field', nameAttr: 'legacy-declaration', level: 'sense' } },
    ] }] }],
    entry: [{
      'lexical-unit': ['word'], field: [named('language', 'entry text')],
      sense: { field: named('source', 'sense text') },
    }],
  });
  assert.deepEqual(app.fields(), ['lexical-unit', 'empty', 'language', 'legacy-declaration', 'source']);
});

test('custom fields search independently across entry and sense values', () => {
  const entry = {
    field: [named('language', 'entry language'), named('source', 'entry source')],
    sense: [
      { field: named('language', 'sense language') },
      { field: [named('language', 'second sense'), named('source', 'sense source')] },
    ],
  };
  const app = harness({ entry: [entry] });
  app.select('language');
  for (const query of ['entry language', 'sense language', 'second sense']) {
    app.search(query);
    assert.equal(app.matches(entry), true, query);
  }
  for (const query of ['entry source', 'sense source']) {
    app.search(query);
    assert.equal(app.matches(entry), false, query);
  }
  app.toggle('language', false);
  app.toggle('source', true);
  app.search('sense source');
  assert.equal(app.matches(entry), true);
  app.search('sense language');
  assert.equal(app.matches(entry), false);
});

test('unchecking one custom field excludes only that field', () => {
  const entry = { field: [named('language', 'selected value'), named('source', 'excluded value')] };
  const app = harness({ entry: [entry] });
  app.toggle(null, false);
  app.toggle('source', false);
  app.search('selected value');
  assert.equal(app.matches(entry), true);
  app.search('excluded value');
  assert.equal(app.matches(entry), false);
  app.toggle('language', false);
  app.search('selected value');
  assert.equal(app.matches(entry), false);
});

test('all-fields search includes custom values but excludes names and XML attributes', () => {
  const entry = {
    $: { id: 'entry-id' }, 'lexical-unit': ['headword'],
    field: [named('custom-name', 'entry value')],
    sense: { field: named('sense-name', 'sense value') },
  };
  const app = harness({ entry: [entry] });
  for (const query of ['headword', 'entry value', 'sense value']) {
    app.search(query);
    assert.equal(app.matches(entry), true, query);
  }
  for (const query of ['entry-id', 'custom-name', 'sense-name']) {
    app.search(query);
    assert.equal(app.matches(entry), false, query);
  }
});

test('legacy direct custom fields and standard fields still share entry/sense scope', () => {
  const entry = {
    language: ['legacy entry'], note: ['entry note'],
    sense: { field: named('language', 'named sense'), note: ['sense note'] },
  };
  const app = harness({ entry: [entry] });
  app.select('language');
  for (const query of ['legacy entry', 'named sense']) {
    app.search(query);
    assert.equal(app.matches(entry), true);
  }
  app.search('note');
  assert.equal(app.matches(entry), false);
  app.select('note');
  for (const query of ['entry note', 'sense note']) {
    app.search(query);
    assert.equal(app.matches(entry), true);
  }
});

test('a custom field actually named field remains selectable without selecting siblings', () => {
  const entry = { field: [named('field', 'actual field'), named('other', 'other value')] };
  const app = harness({ entry: [entry] });
  app.select('field');
  app.search('actual field');
  assert.equal(app.matches(entry), true);
  app.search('other value');
  assert.equal(app.matches(entry), false);
});

test('unnamed field text remains searchable without selecting named fields', () => {
  const entry = { field: ['unlabelled text', named('other', 'sibling text')] };
  const app = harness({ entry: [entry] });
  app.select('field');
  app.search('unlabelled text');
  assert.equal(app.matches(entry), true);
  app.search('sibling text');
  assert.equal(app.matches(entry), false);
});
