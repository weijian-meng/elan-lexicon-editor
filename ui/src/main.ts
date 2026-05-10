// Main application controller

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import * as LexiconTable from "./LexiconTable";
import * as EntryEditor from "./EntryEditor";
import * as ConfigDialog from "./ConfigDialog";
import * as DisplayOptions from "./DisplayOptions";
import * as DiffViewer from "./DiffViewer";
import { LexiconEntry } from "./LexiconTable";

// Styles
import "./assets/styles.css";
import "./assets/diff-styles.css";

// State
let currentLexicon: any = null;
let currentFilePath: string | null = null;
let isModified = false;
let selectedEntry: LexiconEntry | null = null;
// Idempotent init flag (modal DOM is static; listeners attach once)
let initialized = false;

// UI refs for enabling/disabling actions
const actionRefs: {
    newLexiconBtn?: HTMLButtonElement | null;
    openBtn?: HTMLButtonElement | null;
    closeBtn?: HTMLButtonElement | null;
    saveBtn?: HTMLButtonElement | null;
    diffBtn?: HTMLButtonElement | null;
    configBtn?: HTMLButtonElement | null;
    displayOptionsBtn?: HTMLButtonElement | null;
    addEntryBtn?: HTMLButtonElement | null;
    removeEntryBtn?: HTMLButtonElement | null;
    emptySelectionText?: HTMLElement | null;
} = {};

function getBasename(path: string): string {
    const parts = path.split(/[\\/]/);
    return parts[parts.length - 1] || path;
}

function updateFileLabelAndTitle() {
    const baseTitle = "ELAN Lexicon Editor";
    const filenameEl = document.getElementById("fileName");

    let fileLabel = "No file open";
    let titleSuffix = "";

    if (currentFilePath) {
        fileLabel = getBasename(currentFilePath);
        titleSuffix = currentFilePath;
    } else if (currentLexicon) {
        fileLabel = "Untitled";
        titleSuffix = "Untitled";
    }

    if (filenameEl) {
        filenameEl.textContent = fileLabel;
    }

    const modifiedMarker = isModified ? " *" : "";
    const windowTitle = titleSuffix
        ? `${baseTitle} — ${titleSuffix}${modifiedMarker}`
        : `${baseTitle}${modifiedMarker}`;

    getCurrentWebviewWindow()
        .setTitle(windowTitle)
        .catch(() => {
            document.title = windowTitle;
        });
}

function updateActionAvailability() {
    const hasLexicon = !!currentLexicon;
    const hasSelection = !!selectedEntry;

    if (actionRefs.closeBtn) actionRefs.closeBtn.disabled = !hasLexicon;
    if (actionRefs.saveBtn) actionRefs.saveBtn.disabled = !hasLexicon;
    if (actionRefs.diffBtn) actionRefs.diffBtn.disabled = !hasLexicon;

    if (actionRefs.configBtn) actionRefs.configBtn.disabled = !hasLexicon;
    if (actionRefs.displayOptionsBtn)
        actionRefs.displayOptionsBtn.disabled = !hasLexicon;
    if (actionRefs.addEntryBtn) actionRefs.addEntryBtn.disabled = !hasLexicon;
    if (actionRefs.removeEntryBtn)
        actionRefs.removeEntryBtn.disabled = !hasLexicon || !hasSelection;

    if (actionRefs.emptySelectionText) {
        actionRefs.emptySelectionText.textContent = hasLexicon
            ? "Select an entry to edit or create a new one."
            : "";
    }

    const appEl = document.getElementById("app");
    if (appEl) appEl.classList.toggle("no-lexicon", !hasLexicon);

    updateFileLabelAndTitle();
}

// Initialize on DOMContentLoaded to ensure elements exist
document.addEventListener("DOMContentLoaded", () => {
    init();
});

function init() {
    // Prevent double-initialization
    if (initialized) return;
    initialized = true;

    // Init modules
    LexiconTable.init({
        tbody: document.getElementById("lexiconTableBody"),
        onSelect: handleEntrySelect,
    });

    EntryEditor.init({
        getLexicon: () => currentLexicon,
        onChange: handleLexiconChange,
    });

    ConfigDialog.init({
        getLexicon: () => currentLexicon,
        onChange: handleLexiconChange,
    });

    DisplayOptions.init({
        onApply: (config) => {
            LexiconTable.render(
                currentLexicon ? currentLexicon.entry || [] : [],
                selectedEntry ? selectedEntry.$.id : null,
                {
                    sortOrder:
                        currentLexicon &&
                            currentLexicon.header &&
                            currentLexicon.header["sort-order"]
                            ? currentLexicon.header["sort-order"][0]
                            : "",
                }
            );
        },
    });

    DiffViewer.init({
        getLexicon: () => currentLexicon,
        getCurrentFile: () => currentFilePath,
        onChange: handleLexiconChange,
    });

    // Global event listeners
    const newLexiconBtn = document.getElementById("newLexiconBtn") as HTMLButtonElement | null;
    const openBtn = document.getElementById("openFileBtn") as HTMLButtonElement | null;
    const closeBtn = document.getElementById("closeFileBtn") as HTMLButtonElement | null;
    const saveBtn = document.getElementById("saveFileBtn") as HTMLButtonElement | null;
    const diffBtn = document.getElementById("diffBtn") as HTMLButtonElement | null;

    const configBtn = document.getElementById("configBtn") as HTMLButtonElement | null;
    const displayOptionsBtn = document.getElementById("displayOptionsBtn") as HTMLButtonElement | null;
    const addEntryBtn = document.getElementById("addEntryBtn") as HTMLButtonElement | null;
    const removeEntryBtn = document.getElementById("removeEntryBtn") as HTMLButtonElement | null;

    actionRefs.newLexiconBtn = newLexiconBtn;
    actionRefs.openBtn = openBtn;
    actionRefs.closeBtn = closeBtn;
    actionRefs.saveBtn = saveBtn;
    actionRefs.diffBtn = diffBtn;
    actionRefs.configBtn = configBtn;
    actionRefs.displayOptionsBtn = displayOptionsBtn;
    actionRefs.addEntryBtn = addEntryBtn;
    actionRefs.removeEntryBtn = removeEntryBtn;
    actionRefs.emptySelectionText = document.getElementById("emptySelectionText");

    const searchInput = document.getElementById("searchInput");

    const createNewLexiconBtn = document.getElementById("createNewLexiconBtn");
    const cancelNewLexiconBtn = document.getElementById("cancelNewLexiconBtn");

    // Close Modal Listeners
    const closeConfirmModal = document.getElementById("closeConfirmModal");
    const closeConfirmCancel = document.getElementById("closeConfirmCancel");
    const closeConfirmDontSave = document.getElementById("closeConfirmDontSave");
    const closeConfirmSave = document.getElementById("closeConfirmSave");

    if (closeConfirmCancel) {
        closeConfirmCancel.addEventListener("click", () => {
            if (closeConfirmModal) closeConfirmModal.style.display = "none";
        });
    }

    if (closeConfirmDontSave) {
        closeConfirmDontSave.addEventListener("click", () => {
            if (closeConfirmModal) closeConfirmModal.style.display = "none";
            performCloseFile();
        });
    }

    if (closeConfirmSave) {
        closeConfirmSave.addEventListener("click", async () => {
            if (closeConfirmModal) closeConfirmModal.style.display = "none";
            const saved = await handleSaveFile();
            if (saved) {
                performCloseFile();
            }
        });
    }
    if (newLexiconBtn) newLexiconBtn.addEventListener("click", handleNewLexicon);
    if (createNewLexiconBtn) createNewLexiconBtn.addEventListener("click", handleCreateNewLexicon);
    if (cancelNewLexiconBtn) cancelNewLexiconBtn.addEventListener("click", handleCancelNewLexicon);

    if (openBtn) openBtn.addEventListener("click", handleOpenFile);
    if (closeBtn) closeBtn.addEventListener("click", handleCloseFile);
    if (saveBtn) saveBtn.addEventListener("click", () => handleSaveFile());
    if (diffBtn) diffBtn.addEventListener("click", () => DiffViewer.show());

    if (configBtn) configBtn.addEventListener("click", () => ConfigDialog.show());
    if (displayOptionsBtn)
        displayOptionsBtn.addEventListener("click", () => DisplayOptions.show());
    if (addEntryBtn) addEntryBtn.addEventListener("click", handleNewEntry);
    if (removeEntryBtn) removeEntryBtn.addEventListener("click", handleRemoveEntry);

    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            handleSearch((e.target as HTMLInputElement).value);
        });
    }

    // Initial landing state: only New/Open enabled
    updateActionAvailability();

    // Debugging helpers
    window.addEventListener("beforeunload", (e) => {
        console.log("Page is unloading/reloading");
    });
}

function handleEntrySelect(entry: LexiconEntry) {
    selectedEntry = entry;
    EntryEditor.load(entry);

    const rows = document.querySelectorAll("#lexiconTableBody tr");
    rows.forEach((r) => r.classList.remove("selected"));
    const id = entry && entry.$ && entry.$.id;
    if (id) {
        const row = document.querySelector(`tr[data-entry-id="${id}"]`);
        if (row) row.classList.add("selected");
    }

    updateActionAvailability();
}

function handleLexiconChange() {
    console.log("handleLexiconChange called");
    // alert("DEBUG: Lexicon Changed!"); // Uncomment if needed, but let's try indicator first
    setIsModified(true);
    LexiconTable.render(
        currentLexicon ? currentLexicon.entry || [] : [],
        selectedEntry ? selectedEntry.$.id : null,
        {
            sortOrder:
                currentLexicon &&
                    currentLexicon.header &&
                    currentLexicon.header["sort-order"]
                    ? currentLexicon.header["sort-order"][0]
                    : "",
        }
    );

    updateActionAvailability();
}

function setIsModified(modified: boolean) {
    if (isModified !== modified) {
        console.log(`State changed: isModified = ${modified}`);
    }
    isModified = modified;
    const filenameEl = document.getElementById("fileName");
    if (filenameEl) {
        if (modified) filenameEl.classList.add("modified");
        else filenameEl.classList.remove("modified");
    }
    // Update window title logic if desired
    invoke("set_modified", { modified }).catch((e) =>
        console.error("Failed to set window modified state:", e)
    );

    // Save button may be gated in future; keep availability in sync.
    updateActionAvailability();
}

function handleNewLexicon() {
    if (isModified && !confirm("You have unsaved changes. Create new lexicon anyway?")) {
        return;
    }
    const dialog = document.getElementById("newLexiconDialog");
    if (dialog) dialog.classList.remove("hidden");

    const nameInput = document.getElementById("lexiconName") as HTMLInputElement;
    const langInput = document.getElementById("lexiconLanguage") as HTMLInputElement;
    if (nameInput) nameInput.value = "New Lexicon";
    if (langInput) langInput.value = "en";
}

function handleCancelNewLexicon() {
    const dialog = document.getElementById("newLexiconDialog");
    if (dialog) dialog.classList.add("hidden");
}

async function handleCreateNewLexicon() {
    const nameInput = document.getElementById("lexiconName") as HTMLInputElement;
    const langInput = document.getElementById("lexiconLanguage") as HTMLInputElement;

    const name = nameInput ? nameInput.value : "New Lexicon";
    const lang = langInput ? langInput.value : "en";

    try {
        currentLexicon = await invoke<any>("create_lexicon_command", {
            name,
            language: lang,
        });
        currentFilePath = null;
        selectedEntry = null;
        EntryEditor.clear();
        setIsModified(true);

        LexiconTable.render(currentLexicon.entry, null, { sortOrder: "" });

        handleCancelNewLexicon();

        updateActionAvailability();
    } catch (e) {
        console.error(e);
        alert("Error creating lexicon: " + e);
    }
}

async function handleCloseFile() {
    console.log("handleCloseFile called. isModified:", isModified);

    if (isModified) {
        const modal = document.getElementById("closeConfirmModal");
        if (modal) {
            modal.style.display = "flex";
        }
        return;
    }
    performCloseFile();
}

function performCloseFile() {
    currentLexicon = null;
    currentFilePath = null;
    selectedEntry = null;
    EntryEditor.clear();
    setIsModified(false);

    LexiconTable.render([], null, { sortOrder: "" });

    updateActionAvailability();
}

async function handleRemoveEntry() {
    if (!currentLexicon || !selectedEntry) return;
    if (!confirm("Delete this entry?")) return;

    const idx = currentLexicon.entry.indexOf(selectedEntry);
    if (idx >= 0) {
        currentLexicon.entry.splice(idx, 1);
        selectedEntry = null;
        EntryEditor.clear();
        handleLexiconChange();

        updateActionAvailability();
    }
}

async function handleOpenFile() {
    if (
        isModified &&
        !confirm("You have unsaved changes. Continue opening a new file?")
    ) {
        return;
    }

    try {
        const fileRes = await invoke<any>("open_file");
        if (!fileRes) return; // Cancelled

        const { filePath, content } = fileRes;

        const parsed = await invoke<any>("parse_xml_command", { content });
        console.log("Parsed result:", parsed); // Debug

        if (parsed && parsed.lexicon) {
            currentLexicon = parsed.lexicon;
            currentFilePath = filePath;

            // Ensure entry is an array
            if (!currentLexicon.entry) {
                currentLexicon.entry = [];
            } else if (!Array.isArray(currentLexicon.entry)) {
                console.warn("Entry is not an array, wrapping it", currentLexicon.entry);
                currentLexicon.entry = [currentLexicon.entry];
            }

            console.log("Entries to render:", currentLexicon.entry); // Debug

            selectedEntry = null;
            EntryEditor.clear();
            setIsModified(false);

            LexiconTable.render(currentLexicon.entry, null, {
                sortOrder:
                    currentLexicon.header && currentLexicon.header["sort-order"]
                        ? currentLexicon.header["sort-order"][0]
                        : "",
            });

            updateActionAvailability();
        } else {
            alert("Invalid file format: Could not find <lexicon> tag.");
        }
    } catch (e) {
        console.error(e);
        alert("Error opening file: " + e);
    }
}

async function handleSaveFile(): Promise<boolean> {
    if (!currentLexicon) return false;

    try {
        // If we don't have a path, use save_file_dialog_command to pick one
        if (!currentFilePath) {
            const savedPath = await invoke<string>("save_file_dialog_command");
            if (savedPath) {
                currentFilePath = savedPath;
            } else {
                return false; // Cancelled
            }
        }

        const xmlString = await invoke<string>("build_xml_command", {
            data: { lexicon: currentLexicon },
        });

        await invoke("save_file_command", {
            filePath: currentFilePath,
            content: xmlString,
        });

        setIsModified(false);
        alert("File saved!");
        return true;
    } catch (e) {
        console.error(e);
        alert("Error saving file: " + e);
        return false;
    }
}

function handleNewEntry() {
    if (!currentLexicon) {
        alert("No lexicon open. Create or open one first.");
        return; // Or create a new blank lexicon
    }

    const id = `e_${(window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
        Math.random().toString(36).slice(2)
        }`;
    const now = new Date().toISOString();
    const newEntry: LexiconEntry = {
        $: { id, dateCreated: now, dateModified: now },
        "lexical-unit": [""],
        "morph-type": [""],
        sense: [],
    };

    currentLexicon.entry.push(newEntry);
    handleEntrySelect(newEntry);
    handleLexiconChange();
}

function handleSearch(query: string) {
    if (!currentLexicon || !currentLexicon.entry) return;
    const q = query.toLowerCase();

    const filtered = currentLexicon.entry.filter((e: any) => {
        // Basic search in lexical unit, morph type, gloss
        const lu = (e["lexical-unit"] && e["lexical-unit"][0]) || "";
        if (lu.toLowerCase().includes(q)) return true;
        return false;
    });

    // If query is empty, show all
    const toShow = q ? filtered : currentLexicon.entry;

    LexiconTable.render(toShow, selectedEntry ? selectedEntry.$.id : null, {
        sortOrder:
            currentLexicon.header && currentLexicon.header["sort-order"]
                ? currentLexicon.header["sort-order"][0]
                : "",
    });
}
