import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import { styled } from '@mui/material/styles';
import LexiconTable from './LexiconTable';
import EntryEditor from './EntryEditor';
import { v4 as uuidv4 } from 'uuid';

const StyledPaper = styled(Paper)(({ theme }) => ({
  height: '100%',
  padding: theme.spacing(2),
  display: 'flex',
  flexDirection: 'column',
}));

const App = () => {
  const [lexicon, setLexicon] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [currentFile, setCurrentFile] = useState(null);
  const [newLexiconDialog, setNewLexiconDialog] = useState(false);
  const [newLexiconName, setNewLexiconName] = useState('');
  const [newLexiconLanguage, setNewLexiconLanguage] = useState('');

  const handleOpenFile = async () => {
    const result = await window.ipcRenderer.invoke('open-file');
    if (result) {
      const { filePath, content } = result;
      const parsedXml = await window.ipcRenderer.invoke('parse-xml', content);
      setLexicon(parsedXml.lexicon);
      setCurrentFile(filePath);
    }
  };

  const handleSaveFile = async () => {
    if (!currentFile) {
      const result = await window.ipcRenderer.invoke('save-file-dialog');
      if (result) {
        setCurrentFile(result);
      } else {
        return;
      }
    }

    if (currentFile && lexicon) {
      const xmlString = await window.ipcRenderer.invoke('build-xml', lexicon);
      await window.ipcRenderer.invoke('save-file', { filePath: currentFile, content: xmlString });
    }
  };

  const handleNewLexicon = () => {
    setNewLexiconDialog(true);
  };

  const handleCreateNewLexicon = () => {
    const newLexicon = {
      $: {
        schemaVersion: '1.0',
        producer: 'ELAN Lexicon Editor'
      },
      header: {
        name: [newLexiconName],
        language: [newLexiconLanguage],
        description: [''],
        author: [],
        version: ['1.0'],
        'custom-fields': [],
        'field-configs': [],
        'sort-order': []
      },
      entry: []
    };

    setLexicon(newLexicon);
    setNewLexiconDialog(false);
    setNewLexiconName('');
    setNewLexiconLanguage('');
  };

  const handleAddEntry = () => {
    const newEntry = {
      $: {
        id: `e_${uuidv4()}`,
        dateCreated: new Date().toISOString(),
        dateModified: new Date().toISOString(),
      },
      'lexical-unit': [''],
      'morph-type': [''],
      sense: [{
        $: {
          id: `s_${uuidv4()}`,
          order: '1'
        },
        'grammatical-category': [''],
        gloss: ['']
      }]
    };

    setLexicon(prev => ({
      ...prev,
      entry: [...(prev.entry || []), newEntry]
    }));
    setSelectedEntry(newEntry);
  };

  const handleRemoveEntry = () => {
    if (selectedEntry) {
      setLexicon(prev => ({
        ...prev,
        entry: prev.entry.filter(entry => entry.$.id !== selectedEntry.$.id)
      }));
      setSelectedEntry(null);
    }
  };

  return (
    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Lexicon Editor
          </Typography>
          <Button color="inherit" onClick={handleNewLexicon}>
            New Lexicon
          </Button>
          <Button color="inherit" onClick={handleOpenFile}>
            Open
          </Button>
          <Button color="inherit" onClick={handleSaveFile}>
            Save
          </Button>
        </Toolbar>
      </AppBar>

      <Grid container spacing={2} sx={{ flexGrow: 1, p: 2 }}>
        <Grid item xs={6}>
          <StyledPaper>
            <LexiconTable
              entries={lexicon?.entry || []}
              selectedEntry={selectedEntry}
              onSelectEntry={setSelectedEntry}
            />
            <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
              <Button variant="contained" onClick={handleAddEntry}>
                Add Entry
              </Button>
              <Button variant="contained" color="error" onClick={handleRemoveEntry}>
                Remove Entry
              </Button>
            </Box>
          </StyledPaper>
        </Grid>
        <Grid item xs={6}>
          <StyledPaper>
            <EntryEditor
              entry={selectedEntry}
              onChange={(updatedEntry) => {
                setLexicon(prev => ({
                  ...prev,
                  entry: prev.entry.map(entry =>
                    entry.$.id === updatedEntry.$.id ? updatedEntry : entry
                  )
                }));
              }}
            />
          </StyledPaper>
        </Grid>
      </Grid>

      <Dialog open={newLexiconDialog} onClose={() => setNewLexiconDialog(false)}>
        <DialogTitle>Create New Lexicon</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Lexicon Name"
            fullWidth
            value={newLexiconName}
            onChange={(e) => setNewLexiconName(e.target.value)}
          />
          <TextField
            margin="dense"
            label="Language"
            fullWidth
            value={newLexiconLanguage}
            onChange={(e) => setNewLexiconLanguage(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewLexiconDialog(false)}>Cancel</Button>
          <Button onClick={handleCreateNewLexicon} variant="contained">
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default App; 