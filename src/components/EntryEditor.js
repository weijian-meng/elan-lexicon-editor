import React, { useState } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import IconButton from '@mui/material/IconButton';
import Grid from '@mui/material/Grid';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { v4 as uuidv4 } from 'uuid';

const EntryEditor = ({ entry, onChange }) => {
  const [expanded, setExpanded] = useState('basic');

  if (!entry) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography>Select an entry to edit or create a new one</Typography>
      </Box>
    );
  }

  const handleChange = (field, value) => {
    onChange({
      ...entry,
      [field]: [value],
    });
  };

  const handleSenseChange = (index, field, value) => {
    const newSenses = [...entry.sense];
    newSenses[index] = {
      ...newSenses[index],
      [field]: [value],
    };
    onChange({
      ...entry,
      sense: newSenses,
    });
  };

  const handleAddSense = () => {
    const newSense = {
      $: {
        id: `s_${uuidv4()}`,
        order: String(entry.sense.length + 1),
      },
      'grammatical-category': [''],
      gloss: [''],
    };
    onChange({
      ...entry,
      sense: [...entry.sense, newSense],
    });
  };

  const handleRemoveSense = (index) => {
    onChange({
      ...entry,
      sense: entry.sense.filter((_, i) => i !== index),
    });
  };

  return (
    <Box sx={{ p: 2 }}>
      <Accordion
        expanded={expanded === 'basic'}
        onChange={() => setExpanded('basic')}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>Basic Information</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Lexical Unit"
                value={entry['lexical-unit']?.[0] || ''}
                onChange={(e) => handleChange('lexical-unit', e.target.value)}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Morph Type"
                value={entry['morph-type']?.[0] || ''}
                onChange={(e) => handleChange('morph-type', e.target.value)}
              />
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>

      <Accordion
        expanded={expanded === 'senses'}
        onChange={() => setExpanded('senses')}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>Senses</Typography>
        </AccordionSummary>
        <AccordionDetails>
          {entry.sense.map((sense, index) => (
            <Box key={sense.$.id} sx={{ mb: 2, p: 2, border: '1px solid #ddd', borderRadius: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="subtitle1">Sense {index + 1}</Typography>
                <IconButton
                  size="small"
                  onClick={() => handleRemoveSense(index)}
                  disabled={entry.sense.length === 1}
                >
                  <DeleteIcon />
                </IconButton>
              </Box>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Grammatical Category"
                    value={sense['grammatical-category']?.[0] || ''}
                    onChange={(e) => handleSenseChange(index, 'grammatical-category', e.target.value)}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Gloss"
                    value={sense.gloss?.[0] || ''}
                    onChange={(e) => handleSenseChange(index, 'gloss', e.target.value)}
                  />
                </Grid>
              </Grid>
            </Box>
          ))}
          <Button
            startIcon={<AddIcon />}
            onClick={handleAddSense}
            sx={{ mt: 2 }}
          >
            Add Sense
          </Button>
        </AccordionDetails>
      </Accordion>

      <Accordion
        expanded={expanded === 'metadata'}
        onChange={() => setExpanded('metadata')}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>Metadata</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="ID"
                value={entry.$.id}
                disabled
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Date Created"
                value={entry.$.dateCreated}
                disabled
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Date Modified"
                value={entry.$.dateModified}
                disabled
              />
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};

export default EntryEditor; 