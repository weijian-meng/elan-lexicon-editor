# ELAN Lexicon Editor

Desktop editor for creating, reviewing, and saving XML lexicon files that follow the ELAN lexicon schema. The app is built with Tauri 2, a Rust backend, and a vanilla TypeScript/DOM front end.

## Features

- Split-pane UI: sortable lexicon table + entry editor with multi-sense support
- Custom lexical sort order (header `sort-order` tokens)
- Custom fields at entry/sense level (`custom-fields.field-spec`)
- Diff view against disk or git `HEAD`, with selective field comparison and in-memory restore/delete actions
- XML round-trip with stable child ordering and forced array fields

## Prerequisites

- Node.js 18+ (tested with Node 20)
- Rust stable toolchain with Cargo

## Getting Started

```bash
npm install

# Front-end only (Vite):
npm run dev

# Full app with Tauri backend:
npm run tauri dev
```

- Public ELAN reference files live in `resources/elan/`; `lexicon/` is ignored for local test/debug files.
- The front-end entry point is `ui/src/main.ts`; backend command wiring starts in `src-tauri/src/main.rs`.

## Build and Package

```bash
# Type-check and build UI assets to dist/
npm run build

# Build native bundles (outputs under src-tauri/target/release/bundle)
npm run tauri build
```

Release packaging is currently focused on macOS and Windows desktop bundles.

## Testing

```bash
cargo test -p app   # Runs Rust tests (XML utilities, etc.)
```

## Project Structure (key paths)

- `ui/src/main.ts` — wires modules, tracks `currentLexicon/currentFilePath/isModified`, invokes backend commands
- `ui/src/LexiconTable.ts` — table rendering, sorting, display options
- `ui/src/EntryEditor.ts` — entry/sense editing, custom fields, autocomplete
- `ui/src/DiffViewer.ts` — diff UI + restore/delete actions
- `ui/src/ConfigDialog.ts` — header metadata and custom field specs
- `src-tauri/src/lexicon/` — internal lexicon core boundary for XML parse/build, normalization, diffing, and lightweight validation
- `src-tauri/src/source.rs` — app-local disk/git/working-object lexicon source resolution
- `resources/elan/` — ELAN schema/XSD and blank template
- `lexicon/` — ignored local scratch space for private test/debug lexicon XML files

## CI

- Workflow: `.github/workflows/build-binaries.yml`
  - Trigger: manual or tags `v*`
  - Builds Tauri bundles for macOS Apple Silicon, macOS Intel, and Windows
  - Uploads artifacts from the platform-specific `src-tauri/target/<target>/release/bundle` directories

## Data Notice

This repository intentionally does not include real lexicon data. The app can
create a blank ELAN-compatible lexicon directly; `resources/elan/template.xml`
is kept as a reference fixture for local testing. You can also open your own
ELAN-compatible lexicon XML files. Local test/debug files can be kept under
`lexicon/`; they are ignored by git.

## AI Assistance

The maintainer designed the app behavior and UI direction, reviewed the code, tested the app, and is responsible for the final design decisions and releases. Coding assistance was provided by AI tools including Cursor, Claude, Antigravity, and OpenAI Codex at various stages.

The app comes with no warranty. Back up your data and use it at your own risk.

## License

MIT. See `LICENSE`.
