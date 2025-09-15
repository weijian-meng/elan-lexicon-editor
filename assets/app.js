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
        }
        let entryHasChanges = false;
        let originalEntry = null;
        
        // DOM Elements
        const newLexiconBtn = document.getElementById('newLexiconBtn');
        const openFileBtn = document.getElementById('openFileBtn');
        const saveFileBtn = document.getElementById('saveFileBtn');
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
        const cancelConfigBtn = document.getElementById('cancelConfigBtn');
        const saveConfigBtn = document.getElementById('saveConfigBtn');
        const configTabs = document.querySelectorAll('.config-tab');
        const configSections = document.querySelectorAll('.config-section');
        const fieldsTree = document.getElementById('fieldsTree');
        const customFieldsList = document.getElementById('customFieldsList');
        const addCustomFieldBtn = document.getElementById('addCustomFieldBtn');
        
        // Event Listeners
        newLexiconBtn.addEventListener('click', showNewLexiconDialog);
        openFileBtn.addEventListener('click', function() {
            console.log('Open button clicked!');
            handleOpenFile();
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
        configBtn.addEventListener('click', showConfigDialog);
        cancelConfigBtn.addEventListener('click', hideConfigDialog);
        saveConfigBtn.addEventListener('click', handleSaveConfig);
        addCustomFieldBtn.addEventListener('click', handleAddCustomField);
        
        console.log('All event listeners set up!');
        
        configTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.dataset.tab;
                configTabs.forEach(t => t.classList.remove('active'));
                configSections.forEach(s => s.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(`${targetTab}Section`).classList.add('active');
            });
        });
        
        // Initialize modular components
        if (window.LexiconTable) {
            window.LexiconTable.init({
                tbody: lexiconTableBody,
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
            
            // Calculate minimum widths (300px each)
            const minWidth = 300;
            const maxWidth = containerWidth - minWidth;
            
            // Constrain the width between min and max values
            const constrainedWidth = Math.min(Math.max(width, minWidth), maxWidth);
            
            // Update panel widths
            leftPanel.style.width = `${constrainedWidth}px`;
            rightPanel.style.width = `${containerWidth - constrainedWidth - 8}px`; // Subtract resizer width
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
            const containerWidth = document.querySelector('.main-content').offsetWidth;
            const leftPanel = document.querySelector('.panel');
            const rightPanel = document.querySelector('.panel:last-child');
            
            // Set initial widths (50% each, accounting for resizer)
            const panelWidth = (containerWidth - 8) / 2; // Subtract resizer width
            leftPanel.style.width = `${panelWidth}px`;
            rightPanel.style.width = `${panelWidth}px`;
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
        
        function showConfigDialog() {
            if (!lexicon) {
                alert('Please create or open a lexicon first.');
                return;
            }
            
            console.log('Lexicon header:', JSON.stringify(lexicon.header, null, 2)); // Debug log
            
            // Get the first header element since the header is an array
            const header = Array.isArray(lexicon.header) ? lexicon.header[0] : lexicon.header;
            
            // Populate information section
            document.getElementById('configName').value = header.name?.[0] || '';
            document.getElementById('configLanguage').value = header.language?.[0] || '';
            document.getElementById('configDescription').value = header.description?.[0] || '';
            document.getElementById('configAuthor').value = header.author?.[0] || '';
            document.getElementById('configVersion').value = header.version?.[0] || '';
            
            // Populate fields tree
            renderFieldsTree(header);
            
            // Populate custom fields
            renderCustomFields(header);
            
            // Populate sort order
            document.getElementById('sortOrder').value = header['sort-order']?.[0] || '';
            
            configDialog.classList.remove('hidden');
        }
        
        function hideConfigDialog() {
            configDialog.classList.add('hidden');
        }
        
        function renderFieldsTree(header) {
            fieldsTree.innerHTML = '';
            
            // Create root node for entry
            const entryNode = createTreeItem('entry', 'root');
            fieldsTree.appendChild(entryNode);
            
            // Add standard entry-level fields
            const entryFields = ['lexical-unit', 'morph-type'];
            entryFields.forEach(field => {
                const fieldElement = createTreeItem(field, 'entry');
                entryNode.querySelector('.tree-item-children').appendChild(fieldElement);
            });
            
            // Add sense node
            const senseNode = createTreeItem('sense', 'entry');
            entryNode.querySelector('.tree-item-children').appendChild(senseNode);
            
            // Add sense-level fields
            const senseFields = ['grammatical-category', 'gloss'];
            senseFields.forEach(field => {
                const fieldElement = createTreeItem(field, 'sense');
                senseNode.querySelector('.tree-item-children').appendChild(fieldElement);
            });
            
            // Add custom fields if they exist
            if (header['custom-fields'] && header['custom-fields'][0]) {
                const customFieldsContainer = header['custom-fields'][0];
                
                // Handle the case where field-spec is an array
                if (Array.isArray(customFieldsContainer['field-spec'])) {
                    customFieldsContainer['field-spec'].forEach(field => {
                        if (field && field.$) {
                            const fieldElement = createTreeItem(`${field.$.name} (custom)`, field.$.level || 'entry');
                            if (field.$.level === 'entry' || !field.$.level) {
                                entryNode.querySelector('.tree-item-children').appendChild(fieldElement);
                            } else if (field.$.level === 'sense') {
                                senseNode.querySelector('.tree-item-children').appendChild(fieldElement);
                            }
                        }
                    });
                } 
                // Handle the case where field-spec is a single object
                else if (customFieldsContainer['field-spec'] && customFieldsContainer['field-spec'].$) {
                    const field = customFieldsContainer['field-spec'];
                    const fieldElement = createTreeItem(`${field.$.name} (custom)`, field.$.level || 'entry');
                    if (field.$.level === 'entry' || !field.$.level) {
                        entryNode.querySelector('.tree-item-children').appendChild(fieldElement);
                    } else if (field.$.level === 'sense') {
                        senseNode.querySelector('.tree-item-children').appendChild(fieldElement);
                    }
                }
            }
        }
        
        function createTreeItem(name, level) {
            const div = document.createElement('div');
            div.className = 'tree-item';
            
            const content = document.createElement('div');
            content.className = 'tree-item-content';
            
            const icon = document.createElement('span');
            icon.className = 'tree-item-icon';
            icon.onclick = () => {
                const children = div.querySelector('.tree-item-children');
                if (children) {
                    children.style.display = children.style.display === 'none' ? 'block' : 'none';
                    icon.textContent = children.style.display === 'none' ? '▶' : '▼';
                }
            };
            
            const label = document.createElement('span');
            label.className = 'tree-item-label';
            label.textContent = name;
            
            content.appendChild(icon);
            content.appendChild(label);
            div.appendChild(content);
            
            // Add children container if not a leaf node
            if (level !== 'leaf') {
                const children = document.createElement('div');
                children.className = 'tree-item-children';
                div.appendChild(children);
            }
            
            return div;
        }
        
        function renderCustomFields(header) {
            customFieldsList.innerHTML = '';
            
            if (header['custom-fields'] && header['custom-fields'][0]) {
                const customFieldsContainer = header['custom-fields'][0];
                
                // Handle the case where field-spec is an array
                if (Array.isArray(customFieldsContainer['field-spec'])) {
                    customFieldsContainer['field-spec'].forEach(field => {
                        if (field && field.$) {
                            const fieldElement = createCustomFieldElement({
                                name: field.$.name || '',
                                level: field.$.level || 'entry'
                            });
                            customFieldsList.appendChild(fieldElement);
                        }
                    });
                } 
                // Handle the case where field-spec is a single object
                else if (customFieldsContainer['field-spec'] && customFieldsContainer['field-spec'].$) {
                    const field = customFieldsContainer['field-spec'];
                    const fieldElement = createCustomFieldElement({
                        name: field.$.name || '',
                        level: field.$.level || 'entry'
                    });
                    customFieldsList.appendChild(fieldElement);
                }
            }
        }
        
        function createCustomFieldElement(field) {
            const div = document.createElement('div');
            div.className = 'custom-field';
            
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.value = field.name || '';
            nameInput.placeholder = 'Field name';
            
            const levelSelect = document.createElement('select');
            levelSelect.innerHTML = `
                <option value="entry" ${field.level === 'entry' ? 'selected' : ''}>Entry</option>
                <option value="sense" ${field.level === 'sense' ? 'selected' : ''}>Sense</option>
            `;
            
            const removeButton = document.createElement('button');
            removeButton.textContent = 'Remove';
            removeButton.className = 'button danger';
            removeButton.onclick = () => div.remove();
            
            div.appendChild(nameInput);
            div.appendChild(levelSelect);
            div.appendChild(removeButton);
            
            return div;
        }
        
        function handleAddCustomField() {
            const fieldElement = createCustomFieldElement({ name: '', level: 'entry' });
            customFieldsList.appendChild(fieldElement);
        }
        
        function handleSaveConfig() {
            // Get the first header element since the header is an array
            const header = Array.isArray(lexicon.header) ? lexicon.header[0] : lexicon.header;
            
            // Preserve existing header information and only update changed fields
            const nameInput = document.getElementById('configName');
            const languageInput = document.getElementById('configLanguage');
            const descriptionInput = document.getElementById('configDescription');
            const authorInput = document.getElementById('configAuthor');
            const versionInput = document.getElementById('configVersion');
            const sortOrderInput = document.getElementById('sortOrder');
            
            // Update only non-empty fields
            if (nameInput.value) header.name = [nameInput.value];
            if (languageInput.value) header.language = [languageInput.value];
            if (descriptionInput.value) header.description = [descriptionInput.value];
            if (authorInput.value) header.author = [authorInput.value];
            if (versionInput.value) header.version = [versionInput.value];
            if (sortOrderInput.value) header['sort-order'] = [sortOrderInput.value];
            
            // Get new field specs from the UI
            const fieldSpecs = [];
            customFieldsList.querySelectorAll('.custom-field').forEach(fieldElement => {
                const nameInput = fieldElement.querySelector('input');
                const levelSelect = fieldElement.querySelector('select');
                
                let fieldName = nameInput.value;
                fieldName = fieldName.replace(/[^a-zA-Z0-9_]/g, '_');
                
                if (fieldName) {
                    // Add an empty text node to ensure two-part syntax
                    fieldSpecs.push({
                        $: {
                            name: fieldName,
                            level: levelSelect.value
                        },
                        _: '' // Add empty content to force two-part syntax
                    });
                }
            });
            
            // Initialize or update custom fields
            if (!header['custom-fields']) {
                header['custom-fields'] = [{}];
            }
            
            if (!header['custom-fields'][0]) {
                header['custom-fields'][0] = {};
            }
            
            // Replace the field-spec array with our new field specs
            if (fieldSpecs.length > 0) {
                header['custom-fields'][0]['field-spec'] = fieldSpecs;
            } else {
                header['custom-fields'][0]['field-spec'] = [];
            }
        
            console.log('Updated lexicon header:', JSON.stringify(lexicon.header, null, 2));
            
            setIsModified(true);
            updateFileName();
            hideConfigDialog();
        }

        // Override renderers to use componentized modules (defined in entryeditor.js and lexicontable.js)
        // These redefinitions take precedence over earlier function declarations.
        function renderLexiconTable() {
            if (window.LexiconTable) {
                const entries = (lexicon && Array.isArray(lexicon.entry)) ? lexicon.entry : [];
                const selectedId = selectedEntry && selectedEntry.$ ? selectedEntry.$.id : null;
                window.LexiconTable.render(entries, selectedId);
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
