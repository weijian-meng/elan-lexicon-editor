const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function harness(confirmDelete) {
  const source = fs.readFileSync('ui/src/main.ts', 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  let cleared = 0;
  let modified = false;
  const context = {
    exports: {},
    document: { addEventListener() {} },
    require(name) {
      if (name === './confirmDelete') return { confirmDelete };
      if (name === './elanText') return { getFirstElanText: value => value?.[0] || '' };
      if (name === './EntryEditor') return { clear() { cleared++; } };
      return {};
    },
    onChange() { modified = true; },
  };
  vm.createContext(context);
  vm.runInContext(compiled + `
    handleLexiconChange = onChange;
    renderEntries = () => {};
    updateActionAvailability = () => {};
    exports.setState = (lexicon, entry) => { currentLexicon = lexicon; selectedEntry = entry; };
    exports.remove = handleRemoveEntry;
    exports.selection = () => selectedEntry;
  `, context);
  return { ...context.exports, cleared: () => cleared, modified: () => modified };
}

test('Delete removes only the selected entry after confirmation and marks the document modified', async () => {
  const first = { 'lexical-unit': ['first'] };
  const second = { 'lexical-unit': ['second'] };
  const lexicon = { entry: [first, second] };
  const app = harness(async name => { assert.equal(name, 'second'); return true; });
  app.setState(lexicon, second);
  await app.remove();
  assert.deepEqual(lexicon.entry, [first]);
  assert.equal(app.selection(), null);
  assert.equal(app.cleared(), 1);
  assert.equal(app.modified(), true);
});

test('Cancel leaves the entry, selection and modified state unchanged', async () => {
  const entry = { 'lexical-unit': ['keep'] };
  const lexicon = { entry: [entry] };
  const app = harness(async () => false);
  app.setState(lexicon, entry);
  await app.remove();
  assert.deepEqual(lexicon.entry, [entry]);
  assert.equal(app.selection(), entry);
  assert.equal(app.cleared(), 0);
  assert.equal(app.modified(), false);
});

test('A pending confirmation cannot delete from a newly opened document', async () => {
  let resolve;
  const app = harness(() => new Promise(done => { resolve = done; }));
  const entry = {};
  const original = { entry: [entry] };
  const replacement = { entry: [entry] };
  app.setState(original, entry);
  const pending = app.remove();
  app.setState(replacement, entry);
  resolve(true);
  await pending;
  assert.deepEqual(original.entry, [entry]);
  assert.deepEqual(replacement.entry, [entry]);
  assert.equal(app.modified(), false);
});
