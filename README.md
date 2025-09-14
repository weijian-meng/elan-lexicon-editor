# ELAN Lexicon Editor

Python + [pywebview](https://pywebview.flowrl.com/) application for creating and editing XML lexicon files following the ELAN lexicon schema.

## Features

- Split-pane interface with lexicon table view and detailed entry editor
- Support for creating, editing, and deleting lexicon entries
- Multiple senses per entry with grammatical categories and glosses
- XML file import/export
- Sortable columns in the lexicon table
- Modern Material-UI based interface

## Prerequisites

- Python 3.8+
- [uv](https://github.com/astral-sh/uv) for dependency management (optional but recommended)

## Setup (with uv)

```bash
# Create and sync a local .venv from pyproject.toml
uv sync

# Run the app
uv run python main.py
```

If you prefer pip/venv:

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

## Project Structure

- `main.py` — pywebview entry point (with MEIPASS support for packaged builds)
- `index.html` — Front‑end UI
- `lexicon/` — Sample lexicon files and schema
- `pyproject.toml` — Project metadata and dependencies (uv)
- `requirements.txt` — Plain requirements (legacy / pip)
- `elan_lexicon_editor.spec` — PyInstaller spec for packaging

## Packaging

Using PyInstaller via uv:

```bash
# Install PyInstaller to the current environment (dev optional deps)
uv pip install pyinstaller  # or: uvx pyinstaller elan_lexicon_editor.spec

# Build a macOS .app bundle using the provided spec
uv run pyinstaller elan_lexicon_editor.spec

# macOS: launch the .app
open "dist/ELAN Lexicon Editor.app"
```

Notes:
- The packaged app only includes `index.html` (sample `lexicon/` files are not bundled). Use Open/Save to work with files from your disk.
- `main.py` resolves `index.html` from `sys._MEIPASS` when bundled, so packaged apps find resources correctly.
- The serializer emits `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` and includes ELAN schema namespaces for interoperability.

## License

ISC
