const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync('ui/src/elanText.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const api = { exports: {} };
new Function('module', 'exports', compiled)(api, api.exports);
const { resolveDeclaredElanField, setElanTextAt } = api.exports;

test('ELAN entry declarations resolve named values, empty fields and absent fields', () => {
  const entry = { field: [
    { $: { name: 'devanagari' }, _: 'मेमे' },
    { $: { name: 'phonetic_notes' } },
  ] };
  for (const [name, value] of [['devanagari', 'मेमे'], ['phonetic_notes', ''], ['language', '']]) {
    assert.deepEqual(resolveDeclaredElanField(entry, { name, level: 'entry' }), {
      name, fieldName: 'field', customName: name, value,
    });
  }
});

test('sense declarations use the same named representation and preserve attributes on edit', () => {
  const sense = { field: [{ $: { name: 'language', lang: 'en' }, _: 'grv' }] };
  const binding = resolveDeclaredElanField(sense, { name: 'language', level: 'sense' });
  assert.equal(binding.value, 'grv');
  assert.equal(binding.fieldName, 'field');
  setElanTextAt(sense.field, 0, 'new');
  assert.deepEqual(sense.field[0], { $: { name: 'language', lang: 'en' }, _: 'new' });
  assert.equal(sense.language, undefined);
});

test('preserves legacy direct fields but prefers named values when both exist', () => {
  const entry = { devanagari: ['legacy'] };
  assert.equal(resolveDeclaredElanField(entry, { name: 'devanagari' }).fieldName, 'devanagari');
  entry.field = { $: { name: 'devanagari' }, _: 'मेमे' };
  assert.equal(resolveDeclaredElanField(entry, { name: 'devanagari' }).value, 'मेमे');
  assert.equal(resolveDeclaredElanField(entry, { name: 'field', nameAttr: 'devanagari' }).value, 'मेमे');
});
