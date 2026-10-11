const {
  app,
  BrowserWindow,
  clipboard,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  Tray,
} = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MAX_ITEMS = 500;
const MAX_TEXT_LENGTH = 100_000;
const POLL_INTERVAL_MS = 750;

let mainWindow;
let tray;
let pollTimer;
let stateFile;
let saveTimer;
let lastClipboardHash = '';
let state = { paused: false, startAtLogin: false, items: [] };

function hashText(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function loadState() {
  stateFile = path.join(app.getPath('userData'), 'clipshelf.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (parsed && Array.isArray(parsed.items)) {
      state = {
        paused: Boolean(parsed.paused),
        startAtLogin: Boolean(parsed.startAtLogin),
        items: parsed.items.filter(
          (item) => item && typeof item.text === 'string' && typeof item.id === 'string',
        ),
      };
    }
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not load ClipShelf state:', error);
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(stateFile), { recursive: true });
      const temporary = `${stateFile}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
      fs.renameSync(temporary, stateFile);
    } catch (error) {
      console.error('Could not save ClipShelf state:', error);
    }
  }, 150);
}

function publicState() {
  return {
    paused: state.paused,
    startAtLogin: state.startAtLogin,
    items: state.items,
    shortcut: 'Ctrl+Shift+V',
  };
}

function broadcast() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('clipshelf:state', publicState());
  }
  updateTrayMenu();
}

function addClipboardText(rawText) {
  if (state.paused || typeof rawText !== 'string') return;
  const text = rawText.replace(/\r\n/g, '\n');
  if (!text.trim() || text.length > MAX_TEXT_LENGTH) return;

  const id = hashText(text);
  if (id === lastClipboardHash) return;
  lastClipboardHash = id;

  const existingIndex = state.items.findIndex((item) => item.id === id);
  const existing = existingIndex >= 0 ? state.items.splice(existingIndex, 1)[0] : null;
  state.items.unshift({
    id,
    text,
    pinned: Boolean(existing && existing.pinned),
    copiedAt: Date.now(),
  });

  const pinned = state.items.filter((item) => item.pinned);
  const recent = state.items.filter((item) => !item.pinned).slice(0, MAX_ITEMS);
  state.items = [...pinned, ...recent].sort((a, b) => b.copiedAt - a.copiedAt);
  scheduleSave();
  broadcast();
}

async function pollClipboard() {
  try {
    addClipboardText(await clipboard.readText());
  } catch (error) {
    console.error('Clipboard read failed:', error);
  }
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function toggleWindow() {
  if (mainWindow && mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
  } else {
    showWindow();
  }
}

function setStartAtLogin(enabled) {
  state.startAtLogin = Boolean(enabled);
  app.setLoginItemSettings({
    openAtLogin: state.startAtLogin,
    args: ['--hidden'],
  });
  scheduleSave();
  broadcast();
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open ClipShelf', click: showWindow },
      {
        label: state.paused ? 'Resume capture' : 'Pause capture',
        click: () => {
          state.paused = !state.paused;
          scheduleSave();
          broadcast();
        },
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]),
  );
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 760,
    height: 680,
    minWidth: 520,
    minHeight: 460,
    show: !process.argv.includes('--hidden'),
    title: 'ClipShelf',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    backgroundColor: '#111318',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function registerIpc() {
  ipcMain.handle('clipshelf:get-state', () => publicState());
  ipcMain.handle('clipshelf:copy', async (_event, id) => {
    const item = state.items.find((entry) => entry.id === id);
    if (!item) return false;
    await clipboard.writeText(item.text);
    lastClipboardHash = item.id;
    return true;
  });
  ipcMain.handle('clipshelf:toggle-pin', (_event, id) => {
    const item = state.items.find((entry) => entry.id === id);
    if (!item) return false;
    item.pinned = !item.pinned;
    scheduleSave();
    broadcast();
    return true;
  });
  ipcMain.handle('clipshelf:delete', (_event, id) => {
    state.items = state.items.filter((entry) => entry.id !== id);
    scheduleSave();
    broadcast();
    return true;
  });
  ipcMain.handle('clipshelf:clear', () => {
    state.items = state.items.filter((entry) => entry.pinned);
    scheduleSave();
    broadcast();
    return true;
  });
  ipcMain.handle('clipshelf:set-paused', (_event, paused) => {
    state.paused = Boolean(paused);
    if (!state.paused) lastClipboardHash = '';
    scheduleSave();
    broadcast();
    return state.paused;
  });
  ipcMain.handle('clipshelf:set-start-at-login', (_event, enabled) => {
    setStartAtLogin(enabled);
    return state.startAtLogin;
  });
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.whenReady().then(async () => {
    loadState();
    registerIpc();
    createWindow();

    const trayIcon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png'));
    tray = new Tray(trayIcon.resize({ width: 22, height: 22 }));
    tray.setToolTip('ClipShelf');
    tray.on('click', toggleWindow);
    updateTrayMenu();

    globalShortcut.register('CommandOrControl+Shift+V', toggleWindow);
    try {
      lastClipboardHash = hashText((await clipboard.readText()) || '');
    } catch (error) {
      console.error('Initial clipboard read failed:', error);
    }
    pollTimer = setInterval(pollClipboard, POLL_INTERVAL_MS);
  });
}

app.on('before-quit', () => {
  app.isQuitting = true;
  clearInterval(pollTimer);
  clearTimeout(saveTimer);
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // ClipShelf remains available from the tray.
});
