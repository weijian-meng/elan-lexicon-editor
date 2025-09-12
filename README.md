# ELAN Lexicon Editor

A Python and [pywebview](https://pywebview.flowrl.com/) application for creating and editing XML lexicon files following the ELAN lexicon schema.

## Features

- Split-pane interface with lexicon table view and detailed entry editor
- Support for creating, editing, and deleting lexicon entries
- Multiple senses per entry with grammatical categories and glosses
- XML file import/export
- Sortable columns in the lexicon table
- Modern Material-UI based interface

## Prerequisites

- Python 3.8+
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

To run the application:

```bash
python main.py
```

## Project Structure

- `main.py` - pywebview entry point
- `index.html` - Front-end user interface
- `lexicon/` - Sample lexicon files and schema
- `requirements.txt` - Python dependencies

## License

ISC 