import os
import re
import unicodedata
import subprocess
from typing import Any, Dict, Tuple, List

import webview
import xmltodict


class Api:
    ATTR_PREFIX = '$'

    def __init__(self):
        self._modified = False

    def _sanitize_xml(self, s: str) -> str:
        """Remove characters not allowed by XML 1.0 and strip BOM."""
        if not isinstance(s, str):
            return s
        # Remove BOM anywhere and replace non-breaking spaces with regular spaces
        s = s.replace('\ufeff', '')  # ZERO WIDTH NO-BREAK SPACE / BOM
        s = s.replace('\u00A0', ' ')  # NO-BREAK SPACE
        # Filter out invalid XML 1.0 chars
        # Allowed: #x9 | #xA | #xD | #x20-#xD7FF | #xE000-#xFFFD | #x10000-#x10FFFF
        def _valid(ch: str) -> bool:
            cp = ord(ch)
            return (
                cp == 0x9
                or cp == 0xA
                or cp == 0xD
                or 0x20 <= cp <= 0xD7FF
                or 0xE000 <= cp <= 0xFFFD
                or 0x10000 <= cp <= 0x10FFFF
            )
        # Normalize other unicode spaces to regular space where safe
        normalized = []
        for ch in s:
            if not _valid(ch):
                continue
            # Convert all Unicode space separators to ASCII space, except normal space
            if ch != ' ' and unicodedata.category(ch) == 'Zs':
                normalized.append(' ')
            else:
                normalized.append(ch)
        return ''.join(normalized)

    def open_file(self):
        file_types = ('XML files (*.xml)', 'All files (*.*)')
        result = webview.windows[0].create_file_dialog(webview.FileDialog.OPEN, file_types=file_types)
        if result:
            file_path = result[0]
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                return {'filePath': file_path, 'content': content}
            except Exception as e:
                print('Error reading file:', e)
        return None

    def save_file_dialog(self):
        file_types = ('XML files (*.xml)', 'All files (*.*)')
        result = webview.windows[0].create_file_dialog(webview.FileDialog.SAVE, file_types=file_types)
        if result:
            if isinstance(result, (list, tuple)):
                return result[0] if result else None
            return result
        return None

    def save_file(self, file_path, content):
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        except Exception as e:
            print('Error saving file:', e)
            return False

    # Track modified state from the JS side to avoid UI deadlocks on close
    def set_modified(self, modified: bool):
        try:
            self._modified = bool(modified)
        except Exception:
            self._modified = True
        return self._modified

    def _xmltodict_to_xmljs(self, obj):
        if isinstance(obj, dict):
            result = {}
            attrs = {}
            for k, v in obj.items():
                if isinstance(k, str) and k.startswith(self.ATTR_PREFIX) and len(k) > 1:
                    attrs[k[1:]] = self._xmltodict_to_xmljs(v)
                else:
                    result[k] = self._xmltodict_to_xmljs(v)
            if attrs:
                result['$'] = attrs
            return result
        if isinstance(obj, list):
            return [self._xmltodict_to_xmljs(i) for i in obj]
        return obj

    def _xmljs_to_xmltodict(self, obj):
        if isinstance(obj, dict):
            result = {}
            # Pull attributes out of '$' bag if present
            attrs = obj.get('$')
            if isinstance(attrs, dict):
                for ak, av in attrs.items():
                    result[f"{self.ATTR_PREFIX}{ak}"] = self._xmljs_to_xmltodict(av)
            for k, v in obj.items():
                if k == '$':
                    continue
                result[k] = self._xmljs_to_xmltodict(v)
            return result
        if isinstance(obj, list):
            return [self._xmljs_to_xmltodict(i) for i in obj]
        return obj

    def parse_xml(self, xml_string):
        try:
            xml_string = self._sanitize_xml(xml_string)
            forced_lists = (
                'header',
                'entry',
                'variant',
                'sense',
                'author',
                'field-spec',
                'custom-fields',
                'field-configs',
                'lexical-unit',
                'morph-type',
                'citation',
                'phonetic',
                'grammatical-category',
                'gloss',
                'definition',
                'field',
                'name',
                'language',
                'version',
                'description',
            )
            parsed = xmltodict.parse(
                xml_string,
                attr_prefix=self.ATTR_PREFIX,
                cdata_key='_',
                force_list=forced_lists,
            )
            return self._xmltodict_to_xmljs(parsed)
        except Exception as e:
            print('Error parsing XML:', e)
            raise

    def build_xml(self, data):
        try:
            if not isinstance(data, dict) or 'lexicon' not in data:
                raise ValueError('Expected object with a lexicon root')

            # Ensure required namespace attributes on root for interoperability
            lex = data['lexicon']
            if '$' not in lex or not isinstance(lex['$'], dict):
                lex['$'] = {}
            lex_attrs = lex['$']
            lex_attrs.setdefault('schemaVersion', '1.0')
            lex_attrs.setdefault('producer', 'ELAN Lexicon Editor')
            lex_attrs.setdefault('xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance')
            lex_attrs.setdefault('xsi:schemaLocation', 'http://www.mpi.nl/tools/elan/LexiconComponent-1.0.xsd')

            # Convert from xml2js-style to xmltodict-style
            xmltodict_obj = self._xmljs_to_xmltodict(data)

            xml_out = xmltodict.unparse(
                xmltodict_obj,
                attr_prefix=self.ATTR_PREFIX,
                cdata_key='_',
                pretty=True,
                full_document=True,
                encoding='UTF-8',
                short_empty_elements=True,
            )
            # Force XML declaration to include standalone="yes" and uppercase UTF-8
            xml_out = re.sub(
                r'^<\?xml[^>]*\?>',
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
                xml_out,
                count=1,
            )
            return xml_out
        except Exception as e:
            print('Error building XML:', e)
            raise

    # ------------- Structured diff API -------------
    def _canonicalize_lexicon(self, lex: Dict[str, Any], *, ignore_timestamps: bool = True) -> Dict[str, Any]:
        """Return a deep-copied, normalized lexicon dict for deterministic diffs."""
        import copy
        def norm_text(v):
            if isinstance(v, str):
                return v.strip()
            return v

        def sorted_senses(senses):
            senses = list(senses or [])
            senses.sort(key=lambda s: (s.get('$', {}).get('order'), s.get('$', {}).get('id')))
            return senses

        def sorted_variants(variants):
            return sorted(list(variants or []))

        def norm_entry(e):
            e = copy.deepcopy(e)
            attrs = e.get('$', {})
            if ignore_timestamps and 'dateModified' in attrs:
                attrs = dict(attrs)
                attrs.pop('dateModified', None)
                e['$'] = attrs
            # normalize standard fields
            for k in ('lexical-unit', 'morph-type'):
                if k in e and isinstance(e[k], list) and e[k]:
                    e[k] = [norm_text(e[k][0])]
            # normalize variants
            if 'variant' in e:
                e['variant'] = sorted_variants(e.get('variant'))
            # normalize senses
            senses = e.get('sense') or []
            senses = sorted_senses(senses)
            for s in senses:
                s_attrs = s.get('$', {})
                # standard fields normalization
                for k in ('grammatical-category', 'gloss'):
                    if k in s and isinstance(s[k], list) and s[k]:
                        s[k] = [norm_text(s[k][0])]
                s['$'] = s_attrs
            e['sense'] = senses
            # normalize custom fields (direct fields)
            for key, val in list(e.items()):
                if key in ('$', 'lexical-unit', 'morph-type', 'sense', 'variant'):
                    continue
                if isinstance(val, list) and val:
                    e[key] = [norm_text(val[0])]
            return e

        canon = copy.deepcopy(lex or {})
        entries = canon.get('entry') or []
        entries = [norm_entry(e) for e in entries]
        entries.sort(key=lambda e: (e.get('$', {}).get('id'), (e.get('lexical-unit') or [''])[0]))
        canon['entry'] = entries
        # header normalization (keep as-is, optionally could trim strings)
        return canon

    def _index_entries(self, lex: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
        idx = {}
        for e in lex.get('entry') or []:
            entry_id = e.get('$', {}).get('id') or (e.get('lexical-unit') or [''])[0]
            idx[str(entry_id)] = e
        return idx

    def _diff_entries(self, left: Dict[str, Any], right: Dict[str, Any]) -> Dict[str, Any]:
        left_idx = self._index_entries(left)
        right_idx = self._index_entries(right)
        left_ids = set(left_idx.keys())
        right_ids = set(right_idx.keys())
        added = sorted(list(right_ids - left_ids))
        removed = sorted(list(left_ids - right_ids))
        common = sorted(list(left_ids & right_ids))

        def diff_fields(e1: Dict[str, Any], e2: Dict[str, Any]) -> List[Dict[str, Any]]:
            changes = []
            # standard fields
            for field in ('lexical-unit', 'morph-type'):
                v1 = (e1.get(field) or [''])[0]
                v2 = (e2.get(field) or [''])[0]
                if v1 != v2:
                    changes.append({'kind': 'field', 'name': field, 'before': v1, 'after': v2})
            # variants (list)
            v1 = e1.get('variant') or []
            v2 = e2.get('variant') or []
            if v1 != v2:
                changes.append({'kind': 'variants', 'before': v1, 'after': v2})
            # other direct custom fields
            std = {'$', 'lexical-unit', 'morph-type', 'sense', 'variant'}
            keys = set(k for k in e1.keys() if k not in std) | set(k for k in e2.keys() if k not in std)
            for k in sorted(keys):
                v1 = (e1.get(k) or [''])
                v1 = v1[0] if v1 else ''
                v2 = (e2.get(k) or [''])
                v2 = v2[0] if v2 else ''
                if v1 != v2:
                    changes.append({'kind': 'field', 'name': k, 'before': v1, 'after': v2})
            return changes

        def index_senses(s_list):
            idx = {}
            for s in s_list or []:
                sid = s.get('$', {}).get('id') or s.get('$', {}).get('order')
                idx[str(sid)] = s
            return idx

        def diff_senses(e1: Dict[str, Any], e2: Dict[str, Any]) -> Dict[str, Any]:
            s1 = e1.get('sense') or []
            s2 = e2.get('sense') or []
            i1 = index_senses(s1)
            i2 = index_senses(s2)
            ids1 = set(i1.keys())
            ids2 = set(i2.keys())
            added_s = sorted(list(ids2 - ids1))
            removed_s = sorted(list(ids1 - ids2))
            common_s = sorted(list(ids1 & ids2))

            def sense_changes(a, b):
                changes = []
                for field in ('grammatical-category', 'gloss'):
                    v1 = (a.get(field) or [''])[0]
                    v2 = (b.get(field) or [''])[0]
                    if v1 != v2:
                        changes.append({'kind': 'field', 'name': field, 'before': v1, 'after': v2})
                # custom fields (direct only; field@name support could be added later)
                std = {'$', 'grammatical-category', 'gloss'}
                keys = set(k for k in a.keys() if k not in std) | set(k for k in b.keys() if k not in std)
                for k in sorted(keys):
                    v1 = (a.get(k) or [''])
                    v1 = v1[0] if v1 else ''
                    v2 = (b.get(k) or [''])
                    v2 = v2[0] if v2 else ''
                    if v1 != v2:
                        changes.append({'kind': 'field', 'name': k, 'before': v1, 'after': v2})
                return changes

            modified = []
            for sid in common_s:
                ch = sense_changes(i1[sid], i2[sid])
                if ch:
                    modified.append({'id': sid, 'changes': ch})

            # detect simple reorder if no content changes and same ids but different sequences
            reordered = False
            if not modified and not added_s and not removed_s:
                seq1 = [str(s.get('$', {}).get('id') or s.get('$', {}).get('order')) for s in s1]
                seq2 = [str(s.get('$', {}).get('id') or s.get('$', {}).get('order')) for s in s2]
                if seq1 != seq2:
                    reordered = True

            return {
                'added': added_s,
                'removed': removed_s,
                'modified': modified,
                'reordered': reordered,
            }

        modified = []
        for eid in common:
            e1 = left_idx[eid]
            e2 = right_idx[eid]
            fields = diff_fields(e1, e2)
            senses = diff_senses(e1, e2)
            if fields or senses['added'] or senses['removed'] or senses['modified'] or senses['reordered']:
                modified.append({
                    'id': eid,
                    'lexical_unit': (e1.get('lexical-unit') or e2.get('lexical-unit') or [''])[0],
                    'fields': fields,
                    'senses': senses,
                })

        return {
            'added': added,
            'removed': removed,
            'modified': modified,
        }

    def _resolve_source(self, src: Dict[str, Any]) -> Dict[str, Any]:
        """Resolve a source descriptor into a lexicon object (dict with 'entry' etc)."""
        st = (src or {}).get('type')
        if st == 'object':
            data = src.get('data')
            if not data:
                return {}
            # Accept either {'lexicon': {...}} or the lexicon directly
            return data.get('lexicon') if isinstance(data, dict) and 'lexicon' in data else data
        elif st == 'disk':
            path = src.get('path')
            if not path:
                return {}
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                parsed = self.parse_xml(content)
                return parsed.get('lexicon') or {}
            except Exception as e:
                print('Error reading disk source:', e)
                return {}
        elif st == 'git':
            path = src.get('path')
            rev = src.get('rev') or 'HEAD'
            if not path:
                return {}
            try:
                # Find repo root
                workdir = os.path.dirname(path)
                top = subprocess.check_output(['git', '-C', workdir, 'rev-parse', '--show-toplevel'], stderr=subprocess.STDOUT).decode().strip()
                rel = os.path.relpath(path, top)
                blob = subprocess.check_output(['git', '-C', top, 'show', f'{rev}:{rel}'], stderr=subprocess.STDOUT)
                content = blob.decode('utf-8', errors='replace')
                parsed = self.parse_xml(content)
                return parsed.get('lexicon') or {}
            except subprocess.CalledProcessError as e:
                print('Git source error:', e.output.decode(errors='replace'))
                return {}
            except Exception as e:
                print('Error reading git source:', e)
                return {}
        else:
            return {}

    def diff(self, left: Dict[str, Any], right: Dict[str, Any], options: Dict[str, Any] = None) -> Dict[str, Any]:
        """Compute a structured diff between two sources.

        left/right: { type: 'object'|'disk'|'git', data|path|rev }
        options: { ignore_timestamps: bool }
        """
        opts = options or {}
        lex_l = self._resolve_source(left)
        lex_r = self._resolve_source(right)
        can_l = self._canonicalize_lexicon(lex_l, ignore_timestamps=opts.get('ignore_timestamps', True))
        can_r = self._canonicalize_lexicon(lex_r, ignore_timestamps=opts.get('ignore_timestamps', True))
        entry_diff = self._diff_entries(can_l, can_r)
        summary = {
            'entries_added': len(entry_diff['added']),
            'entries_removed': len(entry_diff['removed']),
            'entries_modified': len(entry_diff['modified']),
        }
        return {
            'summary': summary,
            'entries': entry_diff,
        }
