const { app, BrowserWindow, ipcMain, screen, globalShortcut, clipboard } = require('electron')
const path = require('path')

let win
let savedNormalBounds = null

const NORMAL_BOUNDS = { width: 700, height: 780 }
const COMPACT_BOUNDS = { width: 244, height: 64 }

function createWindow() {
  win = new BrowserWindow({
    width: NORMAL_BOUNDS.width,
    height: NORMAL_BOUNDS.height,
    frame: false,
    transparent: false,
    backgroundColor: '#F7F5F3',
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.setAlwaysOnTop(true, 'floating')

  // Show the window once the page is ready. The global hotkey (Ctrl+Space)
  // can't be grabbed under Wayland, so without this the window stays hidden.
  const reveal = () => {
    if (!win.isVisible()) {
      win.show()
      win.focus()
    }
  }
  win.once('ready-to-show', reveal)
  win.webContents.once('did-finish-load', reveal)

  if (!app.isPackaged) {
    win.loadURL(process.env.ELECTRON_START_URL || 'http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

function toggleOverlay() {
  if (!win) return
  if (win.isVisible() && win.isFocused()) {
    win.hide()
    return
  }

  let clipboardText = ''
  try {
    clipboardText = (clipboard.readText() || '').slice(0, 1200)
  } catch {
    clipboardText = ''
  }

  win.show()
  win.focus()
  win.webContents.send('overlay-summon', { clipboardText })
}

function registerShortcuts() {
  const shortcuts = process.platform === 'darwin'
    ? ['Command+K', 'Command+Shift+Space']
    : ['Control+Space', 'Control+Shift+K']

  for (const shortcut of shortcuts) {
    try {
      globalShortcut.register(shortcut, toggleOverlay)
    } catch {
      // Shortcut already taken by the OS or another app.
    }
  }
}

app.whenReady().then(() => {
  createWindow()
  registerShortcuts()
})

app.on('will-quit', () => globalShortcut.unregisterAll())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.on('win-compact', () => {
  if (!win) return
  savedNormalBounds = win.getBounds()
  const { workArea } = screen.getPrimaryDisplay()
  win.setResizable(false)
  win.setBounds({
    x: workArea.x + workArea.width - COMPACT_BOUNDS.width - 24,
    y: workArea.y + workArea.height - COMPACT_BOUNDS.height - 24,
    ...COMPACT_BOUNDS,
  })
})

ipcMain.on('win-restore', () => {
  if (!win) return
  win.setResizable(true)
  win.setBounds(savedNormalBounds || {
    width: NORMAL_BOUNDS.width,
    height: NORMAL_BOUNDS.height,
    x: 80,
    y: 80,
  })
})

ipcMain.on('win-close', () => app.quit())
ipcMain.on('win-hide', () => win && win.hide())
