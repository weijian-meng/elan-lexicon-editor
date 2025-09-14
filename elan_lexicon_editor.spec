# PyInstaller spec for packaging the pywebview app

block_cipher = None

import os

project_dir = os.path.abspath(os.path.dirname(__file__))

datas = [
    (os.path.join(project_dir, 'index.html'), '.'),
    (os.path.join(project_dir, 'lexicon'), 'lexicon'),
]

hiddenimports = [
    'xmltodict',
    'webview',
]

a = Analysis(
    ['main.py'],
    pathex=[project_dir],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='ELAN Lexicon Editor',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=True,
    target_arch=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='ELAN Lexicon Editor'
)
