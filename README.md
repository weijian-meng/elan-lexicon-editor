# ELAN Lexicon Editor

A Python + PyWebView application for creating and editing XML lexicon files following the ELAN lexicon schema.

## Features

- Split-pane interface with lexicon table view and detailed entry editor
- Support for creating, editing, and deleting lexicon entries
- Multiple senses per entry with grammatical categories and glosses
- XML file import/export
- Sortable columns in the lexicon table
- Modern Material-UI based interface

## Prerequisites

- Python 3.8 or later
- pip

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/elan-lexicon-editor.git
cd elan-lexicon-editor
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

## Usage

To launch the application:

```bash
python app.py
```

1. Launch the application
2. Click "Open" to load an existing XML lexicon file or create a new one
3. Use the left pane to view and select entries
4. Use the right pane to edit entry details
5. Click "Save" to save your changes

## Project Structure

- `app.py` - Python entry point using PyWebView
- `index.html` - Frontend interface
- `requirements.txt` - Python dependencies

## License

ISC 
