const { spawn } = require('child_process')
const net = require('net')
const path = require('path')
const fs = require('fs')

const root = path.resolve(__dirname, '..')
const isWindows = process.platform === 'win32'
const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const electronExe = path.join(
  root,
  'node_modules',
  'electron',
  'dist',
  isWindows ? 'electron.exe' : 'electron',
)
const host = '127.0.0.1'
const preferredPort = 5173

let viteProcess = null
let electronProcess = null
let shuttingDown = false

function spawnProcess(label, command, args, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv }
  delete env.ELECTRON_RUN_AS_NODE

  const child = spawn(command, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: false,
  })

  child.on('error', (error) => {
    console.error(`[${label}] failed to start:`, error.message)
    shutdown(1)
  })

  return child
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    socket.setTimeout(500)

    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => {
      socket.destroy()
      resolve(false)
    })

    socket.connect(port, host)
  })
}

async function getAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 50; port += 1) {
    if (!(await isPortOpen(port))) return port
  }

  throw new Error(`No free dev port found between ${startPort} and ${startPort + 49}.`)
}

async function waitForVite(port, startUrl) {
  const deadline = Date.now() + 30000

  while (Date.now() < deadline) {
    if (await isPortOpen(port)) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`Vite did not open ${startUrl} within 30 seconds.`)
}

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true

  if (electronProcess && !electronProcess.killed) electronProcess.kill()
  if (viteProcess && !viteProcess.killed) viteProcess.kill()

  process.exit(code)
}

async function main() {
  if (!fs.existsSync(viteCli)) {
    throw new Error(`Vite CLI not found at ${viteCli}. Run npm install in frontend.`)
  }
  if (!fs.existsSync(electronExe)) {
    throw new Error(`Electron runtime not found at ${electronExe}. Run npm install in frontend.`)
  }

  const port = await getAvailablePort(preferredPort)
  const startUrl = `http://${host}:${port}`

  console.log(`[CorteX dev] Starting Vite on ${startUrl}`)
  viteProcess = spawnProcess('vite', process.execPath, [
    viteCli,
    '--host',
    host,
    '--port',
    String(port),
    '--strictPort',
  ])

  viteProcess.on('exit', (code) => {
    if (!shuttingDown && code !== null && code !== 0) {
      console.error(`[CorteX dev] Vite exited with code ${code}.`)
      shutdown(code)
    }
  })

  await waitForVite(port, startUrl)

  console.log(`[CorteX dev] Opening Electron overlay at ${startUrl}`)
  electronProcess = spawnProcess('electron', electronExe, ['.'], {
    ELECTRON_START_URL: startUrl,
  })

  electronProcess.on('exit', (code) => {
    shutdown(code ?? 0)
  })
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

main().catch((error) => {
  console.error('[CorteX dev]', error.message)
  shutdown(1)
})
