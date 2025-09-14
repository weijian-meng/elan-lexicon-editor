# PyInstaller spec for packaging the pywebview app

block_cipher = None

import os

# When executing a .spec with PyInstaller, __file__ may be undefined.
# Use the current working directory as the project root.
project_dir = os.getcwd()

datas = [
    (os.path.join(project_dir, 'index.html'), '.'),
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
    argv_emulation=False,
    target_arch=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='ELAN Lexicon Editor'
)

icon_path = os.path.join(project_dir, 'assets', 'app.icns')

app = BUNDLE(
    coll,
    name='ELAN Lexicon Editor.app',
    icon=icon_path if os.path.exists(icon_path) else None,
    bundle_identifier='com.yourdomain.elan-lexicon-editor',
)
