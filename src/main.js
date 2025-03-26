const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { parseString, Builder } = require('xml2js');
const webpack = require('webpack');
const webpackConfig = require('../webpack.config.js');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

// Build webpack before creating window
webpack(webpackConfig, (err, stats) => {
  if (err) {
    console.error('Webpack build error:', err);
    return;
  }
  console.log('Webpack build complete');
  createWindow();
});

app.whenReady().then(() => {
  // Window creation is now handled after webpack build
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers for file operations
ipcMain.handle('open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'XML Files', extensions: ['xml'] }]
  });

  if (!result.canceled) {
    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf-8');
    return { filePath, content };
  }
  return null;
});

ipcMain.handle('save-file-dialog', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'XML Files', extensions: ['xml'] }]
  });

  if (!result.canceled) {
    return result.filePath;
  }
  return null;
});

ipcMain.handle('save-file', async (event, { filePath, content }) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (error) {
    console.error('Error saving file:', error);
    return false;
  }
});

// IPC handlers for XML operations
ipcMain.handle('parse-xml', async (event, xmlString) => {
  try {
    const result = await new Promise((resolve, reject) => {
      parseString(xmlString, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
    return result;
  } catch (error) {
    console.error('Error parsing XML:', error);
    throw error;
  }
});

ipcMain.handle('build-xml', async (event, data) => {
  try {
    const builder = new Builder({
      renderOpts: {
        pretty: true,
        indent: '  ',
        newline: '\n'
      },
      headless: false,
      rootName: 'lexicon',
      xmldec: { 'version': '1.0', 'encoding': 'UTF-8' },
      cdata: false,
      // This is key - tells xml2js to always use two-part tags
      emptyTag: (name, attrs) => {
        let result = '<' + name;
        for (let key in attrs) {
          result += ' ' + key + '="' + attrs[key] + '"';
        }
        result += '></' + name + '>';
        return result;
      }
    });
    
    return builder.buildObject(data);
  } catch (error) {
    console.error('Error building XML:', error);
    throw error;
  }
}); 