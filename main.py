import os
import unicodedata
import re
import webview
import xmltodict

class Api:
    ATTR_PREFIX = '$'

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
        # Use modern FileDialog enum (OPEN)
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
        # Use modern FileDialog enum (SAVE)
        result = webview.windows[0].create_file_dialog(webview.FileDialog.SAVE, file_types=file_types)
        if result:
            # pywebview may return a list or a string depending on platform
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
            # Sanitize input to avoid invalid tokens (e.g., stray control chars)
            xml_string = self._sanitize_xml(xml_string)
            # Normalize to arrays for relevant nodes, but keep root as an object
            forced_lists = (
                'header',
                'entry',
                'variant',
                'sense',
                'author',
                'field-spec',
                'custom-fields',
                'field-configs',
                # Common text-bearing elements to align with UI array shape
                'lexical-unit',
                'morph-type',
                'citation',
                'phonetic',
                'grammatical-category',
                'gloss',
                'definition',
                'field',
                # header fields
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
            # Convert attr-prefixed keys to xml2js-style { $: {...} }
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


def main():
    api = Api()
    html_path = os.path.join(os.path.dirname(__file__), 'index.html')
    window = webview.create_window('ELAN Lexicon Editor', html_path, js_api=api)
    webview.start()


if __name__ == '__main__':
    main()
