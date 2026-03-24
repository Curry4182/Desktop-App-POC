import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import 'dotenv/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
let agentModule: typeof import('../agent/graph.js') | null = null

async function loadAgentModule() {
  if (!agentModule) {
    agentModule = await import('../agent/graph.js')
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  await loadAgentModule()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// ─── Reset ───

ipcMain.on('agent:reset', () => {
  agentModule?.resetSession()
})

// ─── Streaming Message Handler ───

ipcMain.on('agent:message', async (event, { message, searchEnabled }) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || !agentModule) return

  try {
    for await (const evt of agentModule.streamGraph(message, searchEnabled ?? true)) {
      if (win.isDestroyed()) break

      switch (evt.type) {
        case 'token':
          win.webContents.send('stream:token', { content: evt.content, node: evt.node })
          break
        case 'custom':
          win.webContents.send('stream:custom', evt.data)
          break
        case 'interrupt': {
          const data = evt.data as any
          if (data?.type === 'clarify') {
            win.webContents.send('stream:interrupt', {
              interruptType: 'clarify',
              id: Date.now().toString(),
              question: data.question,
              options: data.options || [],
            })
          } else if (data?.type === 'confirm') {
            win.webContents.send('stream:interrupt', {
              interruptType: 'confirm',
              id: Date.now().toString(),
              action: data.action,
              description: data.description,
              scriptId: data.scriptId,
            })
          }
          const timeout = setTimeout(() => {
            if (!win.isDestroyed()) {
              win.webContents.send('stream:error', {
                message: '응답 시간이 초과되었습니다.',
              })
            }
          }, 60000)
          ;(win as any).__hitlTimeout = timeout
          return
        }
        case 'done':
          win.webContents.send('stream:done', {})
          break
      }
    }
  } catch (err) {
    if (!win.isDestroyed()) {
      const message = err instanceof Error ? err.message : String(err)
      win.webContents.send('stream:error', { message })
    }
  }
})

// ─── HITL Resume ───

async function resumeAndStream(win: BrowserWindow, resumeValue: unknown) {
  if (!agentModule) return
  try {
    for await (const evt of agentModule.resumeGraph(resumeValue)) {
      if (win.isDestroyed()) break
      switch (evt.type) {
        case 'token':
          win.webContents.send('stream:token', { content: evt.content, node: evt.node })
          break
        case 'custom':
          win.webContents.send('stream:custom', evt.data)
          break
        case 'interrupt': {
          const data = evt.data as any
          if (data?.type === 'clarify') {
            win.webContents.send('stream:interrupt', {
              interruptType: 'clarify',
              id: Date.now().toString(),
              question: data.question,
              options: data.options || [],
            })
          } else if (data?.type === 'confirm') {
            win.webContents.send('stream:interrupt', {
              interruptType: 'confirm',
              id: Date.now().toString(),
              action: data.action,
              description: data.description,
              scriptId: data.scriptId,
            })
          }
          const timeout = setTimeout(() => {
            if (!win.isDestroyed()) {
              win.webContents.send('stream:error', { message: '응답 시간이 초과되었습니다.' })
            }
          }, 60000)
          ;(win as any).__hitlTimeout = timeout
          return
        }
        case 'done':
          win.webContents.send('stream:done', {})
          break
      }
    }
  } catch (err) {
    if (!win.isDestroyed()) {
      const message = err instanceof Error ? err.message : String(err)
      win.webContents.send('stream:error', { message })
    }
  }
}

ipcMain.on('agent:confirm:response', (event, response) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  if ((win as any).__hitlTimeout) {
    clearTimeout((win as any).__hitlTimeout)
    ;(win as any).__hitlTimeout = null
  }
  resumeAndStream(win, response.confirmed)
})

ipcMain.on('agent:clarify:response', (event, response) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  if ((win as any).__hitlTimeout) {
    clearTimeout((win as any).__hitlTimeout)
    ;(win as any).__hitlTimeout = null
  }
  const combined = [...(response.selected || []), response.freeText].filter(Boolean).join(', ')
  resumeAndStream(win, combined)
})
