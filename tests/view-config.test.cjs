const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the file-opening controller, including the path sent to the backend.
const compiled = ts.transpileModule(fs.readFileSync('ui/src/main.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

const viewConfig = { parsers: Object.fromEntries(
  ['variant-devanagari', 'variant-source'].map(name => [name, {
    type: 'keyed-list', attachTo: 'variant', editable: true,
    recordSeparator: '; ', recordDelimiters: ['[', ']'], kvSeparator: ':',
    keyLabel: 'Variant', valueLabel: name, render: 'table',
  }])
) };

function harness(filePath, sidecarPath, sidecarContent) {
  let config = viewConfig; // A previous document's config must not leak through.
  let sidecarRead = false;
  const alerts = [];
  const lexicon = { entry: [{ variant: ['example'] }] };
  const context = {
    exports: {},
    document: { addEventListener() {} },
    console: { log() {}, warn() {}, error() {} },
    alert(message) { alerts.push(message); },
    require(name) {
      if (name === '@tauri-apps/api/core') return {
        async invoke(command, args) {
          if (command === 'open_file') return { filePath, content: '<lexicon/>' };
          if (command === 'parse_xml_command') return { lexicon };
          if (command === 'read_text_file') {
            sidecarRead = true;
            if (args.filePath !== sidecarPath) throw new Error(`Wrong path: ${args.filePath}`);
            if (sidecarContent === null) throw new Error('File not found');
            return sidecarContent;
          }
          throw new Error(`Unexpected command: ${command}`);
        },
      };
      if (name === './EntryEditor') return {
        setViewConfig(value) { config = value; }, clear() {},
      };
      if (name === './SearchBar') return { reset() {} };
      return {};
    },
  };
  vm.createContext(context);
  vm.runInContext(compiled + `
    setIsModified = () => {};
    renderEntries = () => {};
    updateActionAvailability = () => {};
    exports.open = handleOpenFile;
    exports.lexicon = () => currentLexicon;
  `, context);
  return {
    ...context.exports, config: () => config,
    sidecarRead: () => sidecarRead, alerts, expectedLexicon: lexicon,
  };
}

for (const [label, filePath, sidecarPath] of [
  ['Windows drive', String.raw`C:\Users\Collaborator\lexicon.xml`, String.raw`C:\Users\Collaborator\.lexicon-view.json`],
  ['Windows drive root', String.raw`C:\lexicon.xml`, String.raw`C:\.lexicon-view.json`],
  ['Windows network share', String.raw`\\server\share\lexicon.xml`, String.raw`\\server\share\.lexicon-view.json`],
  ['Windows extended path', String.raw`\\?\C:\Data\lexicon.xml`, String.raw`\\?\C:\Data\.lexicon-view.json`],
  ['mixed separators', String.raw`C:\Users/Collaborator\lexicon.xml`, String.raw`C:\Users/Collaborator\.lexicon-view.json`],
  ['macOS with spaces and Unicode', '/Users/Name/Shared न/lexicon.xml', '/Users/Name/Shared न/.lexicon-view.json'],
  ['POSIX root', '/lexicon.xml', '/.lexicon-view.json'],
  ['relative path', 'lexicon.xml', '.lexicon-view.json'],
]) {
  test(`loads variant metadata view configuration from the lexicon folder: ${label}`, async () => {
    const app = harness(filePath, sidecarPath, JSON.stringify(viewConfig));
    await app.open();
    assert.equal(app.sidecarRead(), true);
    assert.deepEqual(JSON.parse(JSON.stringify(app.config())), viewConfig);
    assert.equal(app.lexicon(), app.expectedLexicon);
    assert.deepEqual(app.alerts, []);
  });
}

test('loads UTF-8 BOM-prefixed JSON saved by Windows editors', async () => {
  const app = harness(String.raw`C:\lexicon.xml`, String.raw`C:\.lexicon-view.json`, '\uFEFF' + JSON.stringify(viewConfig));
  await app.open();
  assert.deepEqual(JSON.parse(JSON.stringify(app.config())), viewConfig);
  assert.deepEqual(app.alerts, []);
});

for (const [label, content] of [['missing', null], ['invalid JSON', '{broken']]) {
  test(`${label} sidecar clears previous configuration while still opening the lexicon`, async () => {
    const app = harness(String.raw`C:\lexicon.xml`, String.raw`C:\.lexicon-view.json`, content);
    await app.open();
    assert.equal(app.config(), null);
    assert.equal(app.lexicon(), app.expectedLexicon);
    assert.deepEqual(app.alerts, []);
  });
}
