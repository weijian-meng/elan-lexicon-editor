import os
import webview
import xmltodict

class Api:
    def open_file(self):
        file_types = ('XML files (*.xml)', 'All files (*.*)')
        result = webview.windows[0].create_file_dialog(webview.OPEN_DIALOG, file_types=file_types)
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
        result = webview.windows[0].create_file_dialog(webview.SAVE_DIALOG, file_types=file_types)
        if result:
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

    def parse_xml(self, xml_string):
        try:
            return xmltodict.parse(xml_string, attr_prefix='$', cdata_key='_', force_list=True)
        except Exception as e:
            print('Error parsing XML:', e)
            raise

    def build_xml(self, data):
        try:
            return xmltodict.unparse(data, attr_prefix='$', cdata_key='_', pretty=True)
        except Exception as e:
            print('Error building XML:', e)
            raise


def main():
    api = Api()
    html_path = os.path.join(os.path.dirname(__file__), 'index.html')
    window = webview.create_window('ELAN Lexicon Editor', html_path)
    webview.start(api=api)


if __name__ == '__main__':
    main()
