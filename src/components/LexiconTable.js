import React, { useState } from 'react';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Checkbox from '@mui/material/Checkbox';

const LexiconTable = ({ entries, selectedEntry, onSelectEntry }) => {
  const [orderBy, setOrderBy] = useState('lexical-unit');
  const [order, setOrder] = useState('asc');

  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const getValue = (entry, field) => {
    if (field === 'grammatical-category' || field === 'gloss') {
      return entry.sense?.[0]?.[field]?.[0] || '';
    }
    return entry[field]?.[0] || '';
  };

  const sortedEntries = [...entries].sort((a, b) => {
    const aValue = getValue(a, orderBy);
    const bValue = getValue(b, orderBy);
    return order === 'asc'
      ? aValue.localeCompare(bValue)
      : bValue.localeCompare(aValue);
  });

  const columns = [
    { id: 'lexical-unit', label: 'Lexical Unit' },
    { id: 'morph-type', label: 'Morph Type' },
    { id: 'grammatical-category', label: 'Grammatical Category' },
    { id: 'gloss', label: 'Gloss' },
  ];

  return (
    <TableContainer>
      <Table stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox">
              <Checkbox
                indeterminate={selectedEntry !== null}
                checked={selectedEntry !== null}
                onChange={() => onSelectEntry(null)}
              />
            </TableCell>
            {columns.map((column) => (
              <TableCell key={column.id}>
                <TableSortLabel
                  active={orderBy === column.id}
                  direction={orderBy === column.id ? order : 'asc'}
                  onClick={() => handleRequestSort(column.id)}
                >
                  {column.label}
                </TableSortLabel>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedEntries.map((entry) => (
            <TableRow
              key={entry.$.id}
              hover
              selected={selectedEntry?.$.id === entry.$.id}
              onClick={() => onSelectEntry(entry)}
            >
              <TableCell padding="checkbox">
                <Checkbox
                  checked={selectedEntry?.$.id === entry.$.id}
                  onChange={() => onSelectEntry(entry)}
                />
              </TableCell>
              {columns.map((column) => (
                <TableCell key={column.id}>
                  {getValue(entry, column.id)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default LexiconTable; 