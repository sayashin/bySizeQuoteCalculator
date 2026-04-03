// priceCalculator3/main.js
console.log('[PDF-DEBUG] main.js loaded from:', __filename, 'at', new Date().toISOString());

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
app.disableHardwareAcceleration();

let mainWindow;
let adminWindow;

// Helper to get preload.js path (works in both dev and packaged)
function getPreloadPath() {
  return path.join(__dirname, 'preload.js');
}

// ---- Paths & seed helpers ----
function defaultPricesPath() {
  // bundled read-only file. When packaged files are often inside app.asar
  // Try a few likely locations so packaged and dev builds both work.
  const candidates = [
    path.join(__dirname, 'web', 'prices.json'),
    path.join(process.resourcesPath, 'prices.json'),
    path.join(process.resourcesPath, 'app.asar', 'prices.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return path.join(__dirname, 'web', 'prices.json');
}

function userDataPricesPath() {
  return path.join(app.getPath('userData'), 'prices.json');
}

function ensureSeeded() {
  const dst = userDataPricesPath();
  if (!fs.existsSync(dst)) {
    const src = defaultPricesPath();
    const data = fs.readFileSync(src);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, data);
  }
}

function readUserPrices() {
  ensureSeeded();
  const data = fs.readFileSync(userDataPricesPath(), 'utf8');
  return JSON.parse(data);
}

function writeUserPrices(obj) {
  fs.writeFileSync(userDataPricesPath(), JSON.stringify(obj, null, 2));
}

function createWindow() {
  try {
    mainWindow = new BrowserWindow({
      width: 600,
      height: 900,
      resizable: false,
      webPreferences: {
        contextIsolation: true,
        preload: getPreloadPath(),
        webgl: false,
        sandbox: true,
      },
    });

    mainWindow.loadFile('web/index.html').catch((err) => {
      console.error('Failed to load index.html:', err);
    });
  } catch (err) {
    console.error('Error creating main window:', err);
  }
}

// ---- IPC ----
ipcMain.handle('load-prices', async () => {
  try {
    const prices = readUserPrices();
    return { ok: true, prices };
  } catch (err) {
    console.error('get-prices error:', err);
    return { ok: false, reason: err.message };
  }
});

ipcMain.handle('save-prices', async (_evt, prices) => {
  try {
    writeUserPrices(prices);
    return { ok: true };
  } catch (err) {
    console.error('save-prices error:', err);
    return { ok: false, reason: err.message };
  }
});

ipcMain.handle('export-cart', async (_evt, payload) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export Cart',
      defaultPath: path.join(app.getPath('desktop'), 'cart-summary'),
      filters: [
        { name: 'PDF', extensions: ['pdf'] },
        { name: 'HTML', extensions: ['html'] },
        { name: 'JSON', extensions: ['json'] },
        { name: 'Text', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (canceled || !filePath) return { ok: false, reason: 'canceled' };

    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.pdf') {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      offscreen: true,
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  const html = payload.html || '<pre>Cart</pre>';
  const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);

  await win.loadURL(dataUrl);

  // wait 2 paints (prevents “looks visible but prints blank” races)
  await win.webContents.executeJavaScript(
    "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))"
  );

  const pdfData = await win.webContents.printToPDF({
    printBackground: true,
    preferCSSPageSize: true,
  });

  fs.writeFileSync(filePath, pdfData);
  win.close();

  return { ok: true, path: filePath };
}

    if (ext === '.html') {
      fs.writeFileSync(filePath, payload.html || '<!-- empty -->', 'utf8');
      return { ok: true, path: filePath };
    }

    if (ext === '.json') {
      fs.writeFileSync(filePath, payload.json || JSON.stringify({}, null, 2), 'utf8');
      return { ok: true, path: filePath };
    }

    fs.writeFileSync(filePath, payload.text || (payload.json ? JSON.stringify(payload.json, null, 2) : ''), 'utf8');
    return { ok: true, path: filePath };
  } catch (err) {
    console.error('export-cart error', err);
    return { ok: false, reason: err.message };
  }
});

app.whenReady()
  .then(() => {
    try {
      ensureSeeded();
      createWindow();
    } catch (err) {
      console.error('Error during app startup:', err);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('Failed during app.whenReady():', err);
    process.exit(1);
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Catch unhandled errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});