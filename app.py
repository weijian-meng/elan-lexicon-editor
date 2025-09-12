import webview
import xmltodict
from pathlib import Path


class Api:
    def open_file(self):
        window = webview.windows[0]
        result = window.create_file_dialog(webview.OPEN_DIALOG, file_types=('XML Files (*.xml)',))
        if result:
            file_path = result[0]
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return {'filePath': file_path, 'content': content}
        return None

    def save_file_dialog(self):
        window = webview.windows[0]
        result = window.create_file_dialog(webview.SAVE_DIALOG, save_filename='lexicon.xml', file_types=('XML Files (*.xml)',))
        if result:
            return result if isinstance(result, str) else result[0]
        return None

    def save_file(self, file_path, content):
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        except Exception:
            return False

    def parse_xml(self, xml_string):
        return xmltodict.parse(xml_string)

    def build_xml(self, data):
        return xmltodict.unparse(data, pretty=True)


def main():
    api = Api()
    html = (Path(__file__).parent / 'index.html').resolve()
    webview.create_window('ELAN Lexicon Editor', html.as_uri(), js_api=api)
    webview.start()


if __name__ == '__main__':
    main()
