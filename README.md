# ELAN Lexicon Editor

An Electron-based application for creating and editing XML lexicon files following the ELAN lexicon schema.

## Features

- Split-pane interface with lexicon table view and detailed entry editor
- Support for creating, editing, and deleting lexicon entries
- Multiple senses per entry with grammatical categories and glosses
- XML file import/export
- Sortable columns in the lexicon table
- Modern Material-UI based interface

## Prerequisites

- Node.js (v14 or later)
- npm (v6 or later)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/elan-lexicon-editor.git
cd elan-lexicon-editor
```

2. Install dependencies:
```bash
npm install
```

## Development

To run the application in development mode:

```bash
npm run dev
```

This will start the webpack development server and launch the Electron application. Any changes to the source files will automatically trigger a rebuild.

## Building

To create a production build:

```bash
npm run build
```

## Usage

1. Launch the application
2. Click "Open" to load an existing XML lexicon file or create a new one
3. Use the left pane to view and select entries
4. Use the right pane to edit entry details
5. Click "Save" to save your changes

## Project Structure

- `src/main.js` - Main Electron process
- `src/renderer.js` - Renderer process entry point
- `src/components/` - React components
  - `App.js` - Main application component
  - `LexiconTable.js` - Table view component
  - `EntryEditor.js` - Entry editor component
- `webpack.config.js` - Webpack configuration
- `package.json` - Project configuration and dependencies

## License

ISC 