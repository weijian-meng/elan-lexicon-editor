const uuidv4 = () => window.crypto.randomUUID();

// Close confirmation modal helpers
let closeDialogResult = null;
let closeDialogShown = false;

function showCloseConfirmDialog() {
    closeDialogResult = null;
    closeDialogShown = true;

    const modal = document.getElementById('closeConfirmModal');
    const cancelBtn = document.getElementById('closeConfirmCancel');
    const dontSaveBtn = document.getElementById('closeConfirmDontSave');
    const saveBtn = document.getElementById('closeConfirmSave');

    if (!modal || !cancelBtn || !dontSaveBtn || !saveBtn) {
        closeDialogShown = false;
        return;
    }

    modal.style.display = 'flex';

    const handleChoice = (choice) => {
        modal.style.display = 'none';
        closeDialogResult = choice;
        closeDialogShown = false;
    };

    const newCancelBtn = cancelBtn.cloneNode(true);
    const newDontSaveBtn = dontSaveBtn.cloneNode(true);
    const newSaveBtn = saveBtn.cloneNode(true);

    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    dontSaveBtn.parentNode.replaceChild(newDontSaveBtn, dontSaveBtn);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

    newCancelBtn.addEventListener('click', () => handleChoice('cancel'));
    newDontSaveBtn.addEventListener('click', () => handleChoice('dont_save'));
    newSaveBtn.addEventListener('click', () => handleChoice('save'));

    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            handleChoice('cancel');
            document.removeEventListener('keydown', handleEscape);
        }
    };

    const handleOutsideClick = (e) => {
        if (e.target === modal) {
            handleChoice('cancel');
            modal.removeEventListener('click', handleOutsideClick);
        }
    };

    document.addEventListener('keydown', handleEscape);
    modal.addEventListener('click', handleOutsideClick);
}

function getCloseDialogResult() {
    return closeDialogResult;
}

function isCloseDialogShown() {
    return closeDialogShown;
}
        
        
        // State
        let lexicon = null;
        let selectedEntry = null;
        let currentFile = null;
        let isModified = false;
        // Keep Python informed about modified state changes to avoid JS calls during close
        function setIsModified(value) {
            isModified = !!value;
            console.log(`Setting modified state to: ${isModified}`);
            try {
                if (window.pywebview && window.pywebview.api && typeof window.pywebview.api.set_modified === 'function') {
                    window.pywebview.api.set_modified(isModified);
                    console.log(`Successfully sent modified state to Python: ${isModified}`);
                } else {
                    console.log('pywebview API not available for set_modified');
                }
            } catch (e) {
                console.log('Error setting modified state:', e);
            }
            try {
                const diffBtnEl = document.getElementById('diffBtn');
                const hasLex = !!lexicon;
                const saveDisabled = !(hasLex && (isModified || !currentFile));
                if (saveFileBtn) {
                    saveFileBtn.disabled = saveDisabled;
                    saveFileBtn.style.opacity = saveDisabled ? '0.5' : '1';
                    saveFileBtn.style.cursor = saveDisabled ? 'not-allowed' : 'pointer';
                }
                if (diffBtnEl) {
                    diffBtnEl.disabled = !hasLex;
                    diffBtnEl.style.opacity = diffBtnEl.disabled ? '0.5' : '1';
                    diffBtnEl.style.cursor = diffBtnEl.disabled ? 'not-allowed' : 'pointer';
                }
                if (closeFileBtn) {
                    closeFileBtn.disabled = !hasLex;
                    closeFileBtn.style.opacity = closeFileBtn.disabled ? '0.5' : '1';
                    closeFileBtn.style.cursor = closeFileBtn.disabled ? 'not-allowed' : 'pointer';
                }
            } catch (e) {}
        }
        let entryHasChanges = false;
        let originalEntry = null;
        
        // DOM Elements
        const newLexiconBtn = document.getElementById('newLexiconBtn');
        const openFileBtn = document.getElementById('openFileBtn');
        const saveFileBtn = document.getElementById('saveFileBtn');
        const closeFileBtn = document.getElementById('closeFileBtn');
        const addEntryBtn = document.getElementById('addEntryBtn');
        const removeEntryBtn = document.getElementById('removeEntryBtn');
        const lexiconTableBody = document.getElementById('lexiconTableBody');
        const emptySelection = document.getElementById('emptySelection');
        const entryDetails = document.getElementById('entryDetails');
        const lexicalUnitInput = document.getElementById('lexicalUnit');
        const morphTypeInput = document.getElementById('morphType');
        const sensesContainer = document.getElementById('sensesContainer');
        const addSenseBtn = document.getElementById('addSenseBtn');
        const entryIdInput = document.getElementById('entryId');
        const dateCreatedInput = document.getElementById('dateCreated');
        const dateModifiedInput = document.getElementById('dateModified');
        const newLexiconDialog = document.getElementById('newLexiconDialog');
        const lexiconNameInput = document.getElementById('lexiconName');
        const lexiconLanguageInput = document.getElementById('lexiconLanguage');
        const cancelNewLexiconBtn = document.getElementById('cancelNewLexiconBtn');
        const createNewLexiconBtn = document.getElementById('createNewLexiconBtn');
        const fileNameElement = document.getElementById('fileName');
        const entryStatusElement = document.getElementById('entryStatus');
        const discardChangesBtn = document.getElementById('discardChangesBtn');
        const configBtn = document.getElementById('configBtn');
        const configDialog = document.getElementById('configDialog');
        const displayOptionsBtn = document.getElementById('displayOptionsBtn');
        
        // Event Listeners
        newLexiconBtn.addEventListener('click', showNewLexiconDialog);
        openFileBtn.addEventListener('click', function() {
            console.log('Open button clicked!');
            handleOpenFile();
        });
        closeFileBtn.addEventListener('click', function() {
            console.log('Close (file) button clicked!');
            handleCloseFile();
        });
        saveFileBtn.addEventListener('click', function() {
            console.log('Save button clicked!');
            handleSaveFile();
        });
        addEntryBtn.addEventListener('click', handleAddEntry);
        removeEntryBtn.addEventListener('click', handleRemoveEntry);
        // Sense handling is delegated to EntryEditor module
        // addSenseBtn.addEventListener('click', handleAddSense);
        cancelNewLexiconBtn.addEventListener('click', hideNewLexiconDialog);
        createNewLexiconBtn.addEventListener('click', handleCreateNewLexicon);
        discardChangesBtn.addEventListener('click', handleDiscardChanges);
        configBtn.addEventListener('click', () => { if (window.ConfigDialog) window.ConfigDialog.show(); });
        if (displayOptionsBtn) {
            displayOptionsBtn.addEventListener('click', () => {
                if (window.DisplayOptions) window.DisplayOptions.show();
            });
        }
        
        console.log('All event listeners set up!');
        try {
            const diffBtnEl = document.getElementById('diffBtn');
            if (saveFileBtn) saveFileBtn.disabled = true;
            if (diffBtnEl) diffBtnEl.disabled = !lexicon;
            if (closeFileBtn) closeFileBtn.disabled = !lexicon;
        } catch (e) {}
        try { updateButtonsState(); } catch (e) {}
        
        // Config tabs are handled by ConfigDialog module
        
        // Initialize modular components
        if (window.LexiconTable) {
            window.LexiconTable.init({
                tbody: lexiconTableBody,
                headerRow: document.querySelector('.table-header thead tr'),
                onSelect: (entry) => selectEntry(entry)
            });
        }
        if (window.EntryEditor) {
            window.EntryEditor.init({
                getLexicon: () => lexicon,
                onChange: () => {
                    try {
                        setIsModified(true);
                        entryHasChanges = true;
                        updateFileName();
                        updateEntryStatus();
                        renderLexiconTable();
                    } catch (e) {
                        console.error('Error in entry change handler:', e);
                    }
                }
            });
        }

        if (window.ConfigDialog) {
            window.ConfigDialog.init({
                getLexicon: () => lexicon,
                onChange: () => {
                    setIsModified(true);
                    updateFileName();
                }
            });
        }

        if (window.DisplayOptions) {
            window.DisplayOptions.init({
                onApply: () => {
                    try { renderLexiconTable(); } catch (e) {}
                }
            });
        }

        if (window.DiffViewer) {
            window.DiffViewer.init({
                getLexicon: () => lexicon,
                getCurrentFile: () => currentFile,
                onChange: () => {
                    try {
                        setIsModified(true);
                        updateFileName();
                        updateEntryStatus();
                        renderLexiconTable();
                        renderEntryForm();
                    } catch (e) {
                        console.error('Error in diff apply onChange:', e);
                    }
                }
            });
        }

        // Panel resizing functionality
        const panelResizer = document.getElementById('panelResizer');
        let isResizing = false;
        let startX;
        let startWidth;
        let leftPanel;
        let rightPanel;
        
        panelResizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.pageX;
            
            leftPanel = panelResizer.previousElementSibling;
            rightPanel = panelResizer.nextElementSibling;
            
            startWidth = leftPanel.offsetWidth;
            
            panelResizer.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            
            // Add event listeners for mouse move and up
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
        
        function handleMouseMove(e) {
            if (!isResizing) return;

            const width = startWidth + (e.pageX - startX);
            const containerWidth = leftPanel.parentElement.offsetWidth;
            const resizerWidth = panelResizer ? panelResizer.offsetWidth : 0;

            // Calculate minimum widths (300px each)
            const minWidth = 300;
            const availableWidth = containerWidth - resizerWidth;
            const maxWidth = availableWidth - minWidth;

            // Constrain the width between min and max values
            const constrainedWidth = Math.min(Math.max(width, minWidth), maxWidth);

            // Update panel widths
            leftPanel.style.width = `${constrainedWidth}px`;
            rightPanel.style.width = `${availableWidth - constrainedWidth}px`;
        }
        
        function handleMouseUp() {
            isResizing = false;
            panelResizer.classList.remove('dragging');
            document.body.style.cursor = '';
            
            // Remove event listeners
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        }
        
        // Initialize panel widths
        function initializePanelWidths() {
            const container = document.querySelector('.main-content');
            const leftPanelEl = document.querySelector('.main-content > .panel');
            const rightPanelEl = document.querySelector('.main-content > .panel:last-of-type');

            if (!container || !leftPanelEl || !rightPanelEl) return;

            const containerWidth = container.offsetWidth;
            const resizerWidth = panelResizer ? panelResizer.offsetWidth : 0;
            const availableWidth = containerWidth - resizerWidth;
            if (availableWidth <= 0) return;

            const minWidth = 300;

            let leftWidth;
            if (availableWidth < minWidth * 2) {
                leftWidth = availableWidth / 2;
            } else {
                const preferred = availableWidth * (2 / 3);
                leftWidth = Math.min(availableWidth - minWidth, Math.max(minWidth, preferred));
            }

            let rightWidth = availableWidth - leftWidth;
            if (rightWidth < minWidth) {
                rightWidth = minWidth;
                leftWidth = Math.max(minWidth, availableWidth - rightWidth);
                rightWidth = Math.max(minWidth, availableWidth - leftWidth);
            }

            leftPanelEl.style.width = `${leftWidth}px`;
            rightPanelEl.style.width = `${rightWidth}px`;
        }
        
        // Call initializePanelWidths when the window loads
        window.addEventListener('load', initializePanelWidths);
        
        // Update panel widths when the window is resized
        window.addEventListener('resize', () => {
            if (!isResizing) {
                initializePanelWidths();
            }
        });
        
        // Functions
        function showNewLexiconDialog() {
            newLexiconDialog.classList.remove('hidden');
        }
        
        function hideNewLexiconDialog() {
            newLexiconDialog.classList.add('hidden');
            lexiconNameInput.value = '';
            lexiconLanguageInput.value = '';
        }
        
        async function handleOpenFile() {
            console.log('handleOpenFile called');
            if (!(window.pywebview && window.pywebview.api)) {
                console.log('pywebview API not available');
                alert('The native bridge is not ready yet. Please try again.');
                return;
            }
            console.log('Calling open_file API...');
            const result = await window.pywebview.api.open_file();
            console.log('Open file result:', result);
            if (!result) {
                console.log('No file selected or open failed');
                return;
            }
            const { filePath, content } = result;
            console.log('File path:', filePath, 'Content length:', content ? content.length : 'no content');
            try {
                console.log('Parsing XML...');
                const parsedXml = await window.pywebview.api.parse_xml(content);
                console.log('Parsed XML:', parsedXml);
                if (!parsedXml || !parsedXml.lexicon) {
                    throw new Error('Parsed XML has no lexicon root');
                }
                lexicon = parsedXml.lexicon;
                currentFile = filePath;
                setIsModified(false);
                updateFileName();
                renderLexiconTable();
                clearEntryForm();
                console.log('File opened successfully');
            } catch (err) {
                console.error('Open/parse failed:', err);
                alert(`Failed to open file.\n${(err && err.message) || err}`);
            }
        }

        async function handleSaveFile() {
            console.log('handleSaveFile called');
            try {
                if (!currentFile) {
                    if (!(window.pywebview && window.pywebview.api)) {
                        console.log('pywebview API not ready');
                        alert('The native bridge is not ready yet. Please try again.');
                        return false;
                    }
                    console.log('Getting save file dialog...');
                    const result = await window.pywebview.api.save_file_dialog();
                    if (result) {
                        currentFile = result;
                        console.log('Save file path selected:', currentFile);
                    } else {
                        console.log('Save dialog cancelled');
                        return false;
                    }
                }

                if (currentFile && lexicon) {
                    console.log('Saving to file:', currentFile);
                    // Deep clone the lexicon to avoid modifying the original
                    const lexiconToSave = JSON.parse(JSON.stringify(lexicon));

                    // Fix custom fields to use two-part syntax
                    ensureTwoPartSyntaxForCustomFields(lexiconToSave);

                    console.log('Building XML...');
                    const xmlString = await window.pywebview.api.build_xml({ lexicon: lexiconToSave });
                    console.log('Saving file...');
                    const saveResult = await window.pywebview.api.save_file(currentFile, xmlString);
                    console.log('Save result:', saveResult);
                    
                    if (saveResult) {
                        setIsModified(false);
                        updateFileName();
                        console.log('Save successful');
                        return true;
                    } else {
                        console.log('Save failed');
                        alert('Failed to save file');
                        return false;
                    }
                } else {
                    console.log('No file or lexicon to save');
                    return false;
                }
            } catch (error) {
                console.error('Error in handleSaveFile:', error);
                alert('Error saving file: ' + error.message);
                return false;
            }
        }

        // Helper: show the in-app close confirm and await the choice
        function promptUnsavedChoice() {
            return new Promise((resolve) => {
                try {
                    showCloseConfirmDialog();
                } catch (e) {
                    resolve('cancel');
                    return;
                }
                const start = Date.now();
                const interval = setInterval(() => {
                    try {
                        const shown = typeof isCloseDialogShown === 'function' ? isCloseDialogShown() : false;
                        if (!shown) {
                            clearInterval(interval);
                            const result = typeof getCloseDialogResult === 'function' ? getCloseDialogResult() : 'cancel';
                            resolve(result || 'cancel');
                        } else if (Date.now() - start > 30000) {
                            clearInterval(interval);
                            resolve('cancel');
                        }
                    } catch (e) {
                        clearInterval(interval);
                        resolve('cancel');
                    }
                }, 100);
            });
        }

        // Clear current lexicon and reset UI (keep app window open)
        function resetAfterClose() {
            selectedEntry = null;
            entryHasChanges = false;
            originalEntry = null;
            lexicon = null;
            currentFile = null;
            try { renderLexiconTable(); } catch (e) {}
            try { clearEntryForm(); } catch (e) {}
            try { updateEntryStatus(); } catch (e) {}
            try { updateFileName(); } catch (e) {}
            try {
                // Disable Save/Review visually
                const diffBtnEl = document.getElementById('diffBtn');
                if (saveFileBtn) {
                    saveFileBtn.disabled = true;
                    saveFileBtn.style.opacity = '0.5';
                    saveFileBtn.style.cursor = 'not-allowed';
                }
                if (diffBtnEl) {
                    diffBtnEl.disabled = true;
                    diffBtnEl.style.opacity = '0.5';
                    diffBtnEl.style.cursor = 'not-allowed';
                }
            } catch (e) {}
        }

        async function handleCloseFile() {
            try {
                if (!lexicon) {
                    // Nothing open; just ensure UI reflects no file
                    setIsModified(false);
                    resetAfterClose();
                    return;
                }
                if (isModified) {
                    const choice = await promptUnsavedChoice();
                    if (String(choice) === 'save') {
                        const saved = await handleSaveFile();
                        if (!saved) return; // abort close if save failed or cancelled
                        // fallthrough to close after successful save
                    } else if (String(choice) === 'cancel') {
                        return; // abort close
                    }
                }
                // Close without saving or after save
                setIsModified(false);
                resetAfterClose();
            } catch (e) {
                console.error('Error during handleCloseFile:', e);
            }
        }
        // Allow native side to trigger a save attempt. Resolves to true if saved.
        window.__saveNow = async function() {
            try {
                console.log('__saveNow called, current modified state:', isModified);
                const wasModified = !!isModified;
                const saveResult = await handleSaveFile();
                console.log('Save result from handleSaveFile:', saveResult);
                const nowModified = !!isModified;
                console.log('Modified state after save:', nowModified);
                // Return true if we successfully saved something that was modified
                const success = saveResult && wasModified && !nowModified;
                console.log('Returning success:', success);
                return success;
            } catch (e) {
                console.error('Error in __saveNow:', e);
                return false;
            }
        };
        
        // Add this new function to ensure custom fields use two-part syntax
        function ensureTwoPartSyntaxForCustomFields(lexiconObj) {
            if (!lexiconObj || !lexiconObj.header) return;
            
            // Process each header element (usually just one)
            if (Array.isArray(lexiconObj.header)) {
                lexiconObj.header.forEach(header => {
                    if (header && header['custom-fields'] && Array.isArray(header['custom-fields'])) {
                        header['custom-fields'].forEach(customFields => {
                            if (customFields && customFields['field-spec']) {
                                // Handle array of field specs
                                if (Array.isArray(customFields['field-spec'])) {
                                    customFields['field-spec'] = customFields['field-spec'].map(spec => {
                                        if (spec && spec.$ && !spec._) {
                                            // Add empty content to force two-part syntax
                                            spec._ = '';
                                        }
                                        return spec;
                                    });
                                } 
                                // Handle single field spec
                                else if (customFields['field-spec'] && customFields['field-spec'].$ && !customFields['field-spec']._) {
                                    customFields['field-spec']._ = '';
                                }
                            }
                        });
                    }
                });
            }
            // Handle non-array header (unlikely but possible)
            else if (lexiconObj.header && lexiconObj.header['custom-fields']) {
                const header = lexiconObj.header;
                if (Array.isArray(header['custom-fields'])) {
                    header['custom-fields'].forEach(customFields => {
                        if (customFields && customFields['field-spec']) {
                            // Handle array of field specs
                            if (Array.isArray(customFields['field-spec'])) {
                                customFields['field-spec'] = customFields['field-spec'].map(spec => {
                                    if (spec && spec.$ && !spec._) {
                                        // Add empty content to force two-part syntax
                                        spec._ = '';
                                    }
                                    return spec;
                                });
                            } 
                            // Handle single field spec
                            else if (customFields['field-spec'] && customFields['field-spec'].$ && !customFields['field-spec']._) {
                                customFields['field-spec']._ = '';
                            }
                        }
                    });
                }
            }
        }
        
        function handleCreateNewLexicon() {
            const name = lexiconNameInput.value;
            const language = lexiconLanguageInput.value;
            
            if (!name || !language) {
                alert('Please provide both lexicon name and language.');
                return;
            }
            
            lexicon = {
                $: {
                    schemaVersion: '1.0',
                    producer: 'ELAN Lexicon Editor'
                },
                header: [{
                    name: [name],
                    language: [language],
                    description: [''],
                    author: [],
                    version: ['1.0'],
                    'custom-fields': [{
                        'field-spec': []
                    }],
                    'field-configs': [],
                    'sort-order': []
                }],
                entry: []
            };
            
            currentFile = null;
            setIsModified(true);
            updateFileName();
            hideNewLexiconDialog();
            renderLexiconTable();
            clearEntryForm();
        }
        
        function handleAddEntry() {
            if (!lexicon) {
                alert('Please create or open a lexicon first.');
                return;
            }
            
            const newEntry = {
                $: {
                    id: `e_${uuidv4()}`,
                    dateCreated: new Date().toISOString(),
                    dateModified: new Date().toISOString(),
                },
                'lexical-unit': [''],
                'morph-type': [''],
                variant: [],
                sense: [{
                    $: {
                        id: `s_${uuidv4()}`,
                        order: '1'
                    },
                    'grammatical-category': [''],
                    gloss: ['']
                }]
            };
            
            if (!lexicon.entry) {
                lexicon.entry = [];
            }
            
            lexicon.entry.push(newEntry);
            renderLexiconTable();
            selectEntry(newEntry);
        }
        
        function handleRemoveEntry() {
            if (!selectedEntry) return;
            
            lexicon.entry = lexicon.entry.filter(entry => entry.$.id !== selectedEntry.$.id);
            renderLexiconTable();
            clearEntryForm();
        }
        
        // Variant and sense handlers moved to EntryEditor component
        
        function handleDiscardChanges() {
            if (!selectedEntry) return;
            
            if (entryHasChanges) {
                if (originalEntry) {
                    // Restore original entry
                    Object.assign(selectedEntry, originalEntry);
                } else {
                    // Remove new entry
                    lexicon.entry = lexicon.entry.filter(entry => entry.$.id !== selectedEntry.$.id);
                }
                entryHasChanges = false;
                updateEntryStatus();
                renderLexiconTable();
                renderEntryForm();
            }
        }
        
        function updateEntryStatus() {
            if (!selectedEntry) {
                entryStatusElement.textContent = '';
                entryStatusElement.classList.remove('modified');
                discardChangesBtn.disabled = true;
                return;
            }
            
            if (entryHasChanges) {
                entryStatusElement.textContent = 'Modified';
                entryStatusElement.classList.add('modified');
                discardChangesBtn.disabled = false;
            } else {
                entryStatusElement.textContent = 'No changes';
                entryStatusElement.classList.remove('modified');
                discardChangesBtn.disabled = true;
            }
        }
        
        function selectEntry(entry) {
            selectedEntry = entry;
            // Store a deep copy of the original entry
            originalEntry = JSON.parse(JSON.stringify(entry));
            entryHasChanges = false;
            updateEntryStatus();
            renderEntryForm();
            
            // Highlight the selected row
            const rows = lexiconTableBody.querySelectorAll('tr');
            rows.forEach(row => {
                if (row.dataset.entryId === entry.$.id) {
                    row.classList.add('selected');
                } else {
                    row.classList.remove('selected');
                }
            });
        }
        
        // Entry update logic moved to EntryEditor component
        
        // Table rendering moved to LexiconTable component
        
        // Entry form clearing handled by EntryEditor component
        
        // Entry rendering moved to EntryEditor component
        
        // Custom entry field rendering moved to EntryEditor component
        
        // Custom sense field rendering moved to EntryEditor component
        
        function updateFileName() {
            if (currentFile) {
                const name = currentFile.split('/').pop();
                fileNameElement.textContent = name;
                fileNameElement.classList.toggle('modified', isModified);
            } else {
                fileNameElement.textContent = 'No file open';
                fileNameElement.classList.remove('modified');
            }
        }
        
        // Config dialog moved to ConfigDialog module
        function showConfigDialog() { if (window.ConfigDialog) window.ConfigDialog.show(); }
        
        function hideConfigDialog() { if (window.ConfigDialog) window.ConfigDialog.hide(); }
        
        // renderFieldsTree moved to ConfigDialog module
        
        // createTreeItem moved to ConfigDialog module
        
        // renderCustomFields moved to ConfigDialog module
        
        // createCustomFieldElement moved to ConfigDialog module
        
        // handleAddCustomField moved to ConfigDialog module
        
        // handleSaveConfig moved to ConfigDialog module

        // Override renderers to use componentized modules (defined in entryeditor.js and lexicontable.js)
        // These redefinitions take precedence over earlier function declarations.
        function renderLexiconTable() {
            if (window.LexiconTable) {
                const entries = (lexicon && Array.isArray(lexicon.entry)) ? lexicon.entry : [];
                const selectedId = selectedEntry && selectedEntry.$ ? selectedEntry.$.id : null;
                const header = lexicon && lexicon.header ? (Array.isArray(lexicon.header) ? lexicon.header[0] : lexicon.header) : null;
                const sortOrder = header && header['sort-order'] && header['sort-order'][0] ? header['sort-order'][0] : '';
                window.LexiconTable.render(entries, selectedId, { sortOrder });
                return;
            }
            // Fallback rendering
            if (lexiconTableBody) lexiconTableBody.innerHTML = '';
        }

        function renderEntryForm() {
            if (window.EntryEditor) {
                window.EntryEditor.load(selectedEntry || null);
                return;
            }
            // Fallback (no-op)
        }

        function clearEntryForm() {
            selectedEntry = null;
            if (window.EntryEditor) {
                window.EntryEditor.clear();
                return;
            }
            // Fallback
            emptySelection.classList.remove('hidden');
            entryDetails.classList.add('hidden');
            const customFieldGroups = entryDetails.querySelectorAll('.custom-field-group');
            customFieldGroups.forEach(group => group.remove());
        }
