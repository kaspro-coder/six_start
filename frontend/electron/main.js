const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')

let win

function createWindow() {
  win = new BrowserWindow({
    width: 700,
    height: 780,
    frame: false,
    backgroundColor: '#F7F5F3',
    alwaysOnTop: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.setAlwaysOnTop(true, 'floating')

  if (!app.isPackaged) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.on('win-compact',         () => { win.setResizable(false); win.setSize(300, 52) })
ipcMain.on('win-restore',         () => { win.setSize(700, 780); win.setResizable(true) })
let savedBounds = null
ipcMain.on('win-toggle-maximize', () => {
  if (win.isMaximized()) {
    win.unmaximize()
    if (savedBounds) win.setBounds(savedBounds)
  } else {
    savedBounds = win.getBounds()
    win.maximize()
  }
})
ipcMain.on('win-close',           () => app.quit())
