const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function compile(name) {
  return ts.transpileModule(fs.readFileSync(`ui/src/${name}.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
}

const elanText = { exports: {} };
new Function('exports', compile('elanText'))(elanText.exports);
const compiled = compile('EntryEditor');
const main = compile('main');

function element() {
  return {
    children: [], classList: { add() {}, remove() {}, toggle() {} },
    set innerHTML(_) { this.children = []; },
    appendChild(child) { this.children.push(child); },
    replaceChildren(...children) { this.children = children; },
    setAttribute() {}, addEventListener() {}, querySelectorAll() { return []; },
    validity: { customError: false },
    setCustomValidity(error) {
      this.validationMessage = error;
      this.validity.customError = !!error;
    },
    reportValidity() {},
    input(value) { this.value = value; this.oninput({ target: this }); },
  };
}

const desc = {
  type: 'keyed-list', attachTo: 'variant', editable: true,
  recordSeparator: '; ', recordDelimiters: ['[', ']'], kvSeparator: ':',
};

function harness(entry, parsers = { 'variant-devanagari': desc, 'variant-source': desc }) {
  const elements = new Map();
  const alerts = [];
  const context = {
    exports: {},
    document: {
      body: element(), createElement: element,
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
      },
    },
    require: () => elanText.exports,
    console: { log() {} },
    confirm: () => true,
    alert: message => alerts.push(message),
    setTimeout() {}, clearTimeout() {},
  };
  vm.runInNewContext(compiled, context);
  const editor = context.exports;
  editor.init({ getLexicon: () => ({ entry: [entry] }) });
  editor.setViewConfig({ parsers });
  editor.load(entry);

  const readRow = (index, field) => {
    const group = elements.get(`${field === 'variant' ? 'variants' : field}Container`).children[index];
    const [row, metadata] = group.children;
    return {
      form: row.children[0], remove: () => row.children[1].onclick(),
      metadata: metadata.children.map(row => row.children[1]),
    };
  };
  return {
    add: () => elements.get('addVariantBtn').onclick(),
    discard: () => elements.get('discardChangesBtn').onclick(),
    row: (index = 0, field = 'variant') => readRow(index, field),
    reload: () => editor.load(entry),
    select: other => editor.load(other),
    editor,
    alerts,
  };
}

const named = (name, value) => ({ $: { name }, _: value });
const devanagari = value => named('variant-devanagari', value);
const source = value => named('variant-source', value);

test('adding and deleting blank variants never creates metadata or inherits a deleted value', () => {
  const entry = {};
  const app = harness(entry);
  app.add();
  assert.equal(entry.field, undefined);
  assert.equal(app.row().metadata[0].readOnly, false);
  app.row().metadata[0].input('deleted draft');
  assert.equal(entry.field, undefined);
  app.row().remove();
  assert.equal(entry.field, undefined);

  app.add();
  assert.equal(app.row().metadata[0].value, '');
  app.row().form.input('yuli');
  app.row().metadata[0].input('युलि');
  assert.deepEqual(structuredClone(entry.field), [devanagari('[yuli: युलि]')]);
  app.row().remove();
  app.add();
  assert.equal(app.row().metadata[0].value, '');
  app.row().form.input('yuli');
  assert.equal(app.row().metadata[0].value, '');
  assert.deepEqual(structuredClone(entry.field), [devanagari('')]);
});

test('drafts follow their own row after deleting a neighbor and switching entries', () => {
  const entry = { variant: ['other'], field: [source('[lost: older]')] };
  const app = harness(entry);
  app.add();
  app.row(1).metadata[0].input('युलि');
  app.add();
  app.row(2).metadata[0].input('छ्यो');
  app.row(2).metadata[1].input('notes');
  app.row(0).remove();
  app.select({ variant: [''] });
  assert.equal(app.row().metadata[0].value, '');
  app.reload();
  assert.equal(app.row().metadata[0].value, 'युलि');
  assert.equal(app.row(1).metadata[0].value, 'छ्यो');

  app.row(1).form.input('lost');
  assert.match(app.row(1).form.validationMessage, /unmatched/);
  assert.deepEqual(entry.field, [source('[lost: older]')]);
  assert.equal(app.row(1).metadata[0].value, 'छ्यो');
  app.row(1).form.input('chyo');
  app.row().form.input('yuli');
  assert.deepEqual(structuredClone(entry.field), [
    source('[lost: older]; [chyo: notes]'),
    devanagari('[chyo: छ्यो]; [yuli: युलि]'),
  ]);
  assert.equal(app.editor.findEntryWithMetadataDraft(), undefined);
});

test('saving waits for a draft spelling even when a different entry is selected', async () => {
  const entry = { 'lexical-unit': ['yurkali'], variant: [''] };
  const app = harness(entry);
  app.row().metadata[0].input('युलि');
  app.select({ variant: ['different entry'] });
  const commands = [];
  const alerts = [];
  const context = {
    exports: {},
    document: { addEventListener() {}, getElementById() {} },
    console: { log() {}, error() {} },
    alert: message => alerts.push(message),
    entry,
    require(name) {
      if (name === './EntryEditor') return app.editor;
      if (name === './elanText') return elanText.exports;
      if (name === '@tauri-apps/api/core') return {
        async invoke(command, args) {
          commands.push(command);
          if (command === 'build_xml_command') return JSON.stringify(args.data);
        },
      };
      return {};
    },
  };
  vm.runInNewContext(main + `
    currentLexicon = { entry: [entry] };
    currentFilePath = '/lexicon.xml';
    updateActionAvailability = () => {};
    exports.save = handleSaveFile;
  `, context);
  assert.equal(await context.exports.save(), false);
  assert.deepEqual(commands, []);
  assert.match(alerts[0], /yurkali/);
  assert.equal(entry.field, undefined);

  app.reload();
  app.row().form.input('yuli');
  assert.equal(await context.exports.save(), true);
  assert.deepEqual(commands.slice(0, 2), ['build_xml_command', 'save_file_command']);
});

test('discarding an entry draft clears the pending save check', () => {
  const entry = { variant: [''] };
  const app = harness(entry);
  app.row().metadata[0].input('युलि');
  app.reload();
  app.discard();
  assert.equal(app.row().metadata[0].value, '');
  assert.equal(app.editor.findEntryWithMetadataDraft(), undefined);
  assert.equal(entry.field, undefined);
});

test('renaming a variant moves both fields and later edits use the new spelling', () => {
  const entry = {
    variant: [{ $: { lang: 'grv' }, _: 'yuli' }, 'other'],
    field: [devanagari('[yuli: युलि]; [other: अरु]'), source('[yuli: notes]; [other: text]')],
  };
  const app = harness(entry);
  app.row().form.input('  yulii  ');
  app.row().metadata[0].input('युली');
  assert.deepEqual(entry.variant[0], { $: { lang: 'grv' }, _: '  yulii  ' });
  assert.deepEqual(entry.field, [
    devanagari('[yulii: युली]; [other: अरु]'), source('[yulii: notes]; [other: text]'),
  ]);
  app.reload();
  assert.equal(app.row().metadata[0].value, 'युली');
  app.row().remove();
  assert.deepEqual(entry.field, [devanagari('[other: अरु]'), source('[other: text]')]);
  app.row().metadata[0].input('');
  assert.deepEqual(entry.field, [devanagari(''), source('[other: text]')]);
});

test('keyless legacy values stay unassigned and untouched by unrelated edits', () => {
  const entry = {
    variant: ['khaini'],
    field: [devanagari('[: खइनि]; [khaini: खइनि]; [: ]; [: ]; [: ]')],
  };
  const app = harness(entry);
  assert.equal(app.row().metadata[0].value, 'खइनि');
  app.add();
  assert.equal(app.row(1).metadata[0].value, '');
  app.row(1).form.input('new');
  app.row(1).metadata[0].input('न्यु');
  assert.deepEqual(entry.field, [devanagari('[: खइनि]; [khaini: खइनि]; [new: न्यु]')]);
});

test('renames cannot take a sibling or orphan key, and a conflict leaves every field intact', () => {
  const entry = {
    variant: ['yuli', 'other'],
    field: [devanagari('[yuli: युलि]'), source('[yuli: notes]; [lost: older]')],
  };
  const before = structuredClone(entry);
  const app = harness(entry);
  const { form } = app.row();
  form.input('other');
  assert.match(form.validationMessage, /unique/);
  form.input('lost');
  assert.match(form.validationMessage, /unmatched/);
  form.onblur();
  assert.equal(form.value, 'yuli');
  assert.deepEqual(entry, before);
});

test('existing duplicate variants or records never silently pick an owner', () => {
  for (const [variant, raw] of [
    [['yuli', 'yuli'], '[yuli: युलि]'],
    [['yuli'], '[yuli: युलि]; [yuli: फरक]'],
  ]) {
    const entry = { variant, field: [devanagari(raw)] };
    const app = harness(entry);
    assert.equal(app.row().metadata[0].readOnly, true);
    assert.equal(app.row().metadata[0].value, '');
    app.row().remove();
    assert.match(app.alerts[0], /ambiguous/);
    assert.deepEqual(entry, { variant, field: [devanagari(raw)] });
  }
});

test('malformed records are preserved and separator text cannot create extra records', () => {
  const entry = { variant: ['yuli'], field: [devanagari('[yuli: युलि]'), source('broken record')] };
  const app = harness(entry);
  app.row().form.input('new');
  assert.match(app.row().form.validationMessage, /stored format/);
  assert.deepEqual(entry.variant, ['yuli']);
  assert.deepEqual(entry.field, [devanagari('[yuli: युलि]'), source('broken record')]);

  const meta = app.row().metadata[0];
  meta.input('one; [other: two]');
  assert.match(meta.validationMessage, /separator/);
  assert.equal(entry.field[0]._, '[yuli: युलि]');
  meta.input('one: two');
  assert.equal(entry.field[0]._, '[yuli: one: two]');
});

test('phonetic attachments and legacy direct fields use the same safe lifecycle', () => {
  const entry = { phonetic: ['yuli'], 'phonetic-source': ['yuli: notes'] };
  const app = harness(entry, { 'phonetic-source': { ...desc, attachTo: 'phonetic' } });
  app.row(0, 'phonetic').form.input('yulii');
  assert.deepEqual(entry['phonetic-source'], ['[yulii: notes]']);
  assert.equal(entry.field, undefined);
  app.row(0, 'phonetic').remove();
  assert.deepEqual(entry['phonetic-source'], ['']);
});
