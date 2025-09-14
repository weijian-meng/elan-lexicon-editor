import os
import sys
import threading
import time
import unicodedata
import re
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
    base_dir = getattr(sys, "_MEIPASS", os.path.dirname(__file__))
    html_path = os.path.join(base_dir, 'index.html')
    window = webview.create_window('ELAN Lexicon Editor', html_path, js_api=api)

    def close_app():
        """Properly close the application"""
        print("Destroying window...")
        try:
            # First hide the window to give immediate feedback
            window.hide()
        except Exception:
            pass
        
        import threading
        # Schedule window destruction on a separate thread to avoid blocking
        def delayed_destroy():
            import time
            time.sleep(0.1)  # Small delay to let current operations finish
            try:
                window.destroy()
                print("Window destroyed successfully")
            except Exception as e:
                print(f"Error destroying window: {e}")
                # Force exit if destroy doesn't work
                try:
                    import os
                    print("Force exiting...")
                    os._exit(0)
                except Exception as e2:
                    print(f"Error with force exit: {e2}")
        
        threading.Thread(target=delayed_destroy, daemon=True).start()

    # Intercept window close to prompt saving unsaved work
    def on_closing():
        print(f"Close event triggered! Modified state: {getattr(api, '_modified', False)}")
        # Never call into JS or block the GUI inside this event.
        # Just consult the Python-side modified flag and, if needed,
        # schedule any UI work on a background thread and cancel close.
        if not getattr(api, '_modified', False):
            print("No changes detected, allowing close")
            return True  # no changes -> allow close

        def _prompt_and_handle():
            try:
                print("Showing close confirmation dialog...")
                
                # Option 1: Use nice modal dialog
                try:
                    print("Attempting JavaScript modal dialog...")
                    
                    # Show the modal
                    window.evaluate_js('showCloseConfirmDialog()')
                    
                    # Poll for result
                    import time
                    result = None
                    timeout = 30  # 30 second timeout
                    start_time = time.time()
                    
                    while time.time() - start_time < timeout:
                        # Check if dialog is still shown
                        dialog_shown = window.evaluate_js('isCloseDialogShown()')
                        if not dialog_shown:
                            # Dialog was closed, get the result
                            result = window.evaluate_js('getCloseDialogResult()')
                            break
                        time.sleep(0.1)  # Small delay to avoid busy polling
                    
                    print(f"JavaScript dialog result: {result}")
                    
                    if str(result) == 'save':
                        print("User chose to save - attempting to save and close")
                        def _after_save(save_result=None):
                            try:
                                saved = bool(save_result)
                                print(f"Save result: {saved}")
                            except Exception:
                                saved = False
                            if saved:
                                print("Save successful, closing window")
                                api._modified = False
                                close_app()
                            else:
                                print("Save failed or cancelled, staying open")
                        
                        try:
                            print("Calling JavaScript save function...")
                            window.evaluate_js('typeof window.__saveNow === "function" ? window.__saveNow() : Promise.resolve(false)', _after_save)
                        except Exception as e:
                            print(f"Error calling save function: {e}")
                            
                    elif str(result) == 'dont_save':
                        print("User chose to close without saving")
                        api._modified = False
                        close_app()
                    else:
                        print("User cancelled - staying open")
                        
                except Exception as js_error:
                    print(f"JavaScript dialog failed: {js_error}, falling back to native dialogs")
                    
                    # Fallback: Use native dialogs (2-step approach)
                    save_choice = window.create_confirmation_dialog(
                        'Unsaved Changes', 
                        'You have unsaved changes. Do you want to save before closing?'
                    )
                    
                    print(f"User choice for save: {save_choice}")
                    
                    if save_choice:
                        print("User chose to save - attempting to save and close")
                        def _after_save(result=None):
                            try:
                                saved = bool(result)
                                print(f"Save result: {saved}")
                            except Exception:
                                saved = False
                            if saved:
                                print("Save successful, closing window")
                                api._modified = False
                                close_app()
                            else:
                                print("Save failed or cancelled, staying open")
                        try:
                            print("Calling JavaScript save function...")
                            window.evaluate_js('typeof window.__saveNow === "function" ? window.__saveNow() : Promise.resolve(false)', _after_save)
                        except Exception as e:
                            print(f"Error calling save function: {e}")
                    else:
                        print("User chose not to save - asking for confirmation to close without saving")
                        really_close = window.create_confirmation_dialog(
                            'Confirm Close', 
                            'Are you sure you want to close without saving? Your changes will be lost.'
                        )
                        
                        print(f"User choice for close without save: {really_close}")
                        
                        if really_close:
                            print("User confirmed close without save")
                            api._modified = False
                            close_app()
                        else:
                            print("User cancelled - staying open")
                
            except Exception as e:
                print(f"Error in close prompt: {e}")
                # Fallback to simple close without save
                api._modified = False
                close_app()

        threading.Thread(target=_prompt_and_handle, daemon=True).start()
        return False  # cancel this close; follow-up will destroy window

    try:
        print("Attempting to bind close event...")
        if hasattr(window, 'events') and hasattr(window.events, 'closing'):
            window.events.closing += on_closing
            print("Successfully bound close event!")
        else:
            print("Window events or closing event not available")
    except Exception as e:
        print(f"Error binding close event: {e}")
        # Alternative approach - set confirm_close
        try:
            window.confirm_close = True
            print("Set confirm_close to True as fallback")
        except Exception as e2:
            print(f"Could not set confirm_close: {e2}")

    webview.start()


if __name__ == '__main__':
    main()
