import os
import sys
import webview

from backend.api import Api
from backend.close_flow import bind_close_handlers


def main():
    api = Api()
    base_dir = getattr(sys, "_MEIPASS", os.path.dirname(__file__))
    html_path = os.path.join(base_dir, 'index.html')
    window = webview.create_window('ELAN Lexicon Editor', html_path, js_api=api)

    # Bind close handlers (JS modal + native fallback)
    bind_close_handlers(window, api)

    webview.start()


if __name__ == '__main__':
    main()

