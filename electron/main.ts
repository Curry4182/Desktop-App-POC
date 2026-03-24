import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import 'dotenv/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
let agentModule: typeof import('../agent/graph.js') | null = null
let conversationModule: typeof import('../agent/history/conversation-manager.js') | null = null
let conversationManager: InstanceType<typeof import('../agent/history/conversation-manager.js').ConversationManager> | null = null

async function loadAgentModule() {
  if (!agentModule) {
    agentModule = await import('../agent/graph.js')
  }
  if (!conversationModule) {
    conversationModule = await import('../agent/history/conversation-manager.js')
    conversationManager = new conversationModule.ConversationManager()
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

// ─── Streaming Message Handler ───

ipcMain.on('agent:message', async (event, { message, searchEnabled }) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || !agentModule || !conversationManager) return

  try {
    const { HumanMessage } = await import('@langchain/core/messages')
    conversationManager.addMessage(new HumanMessage(message))
    await conversationManager.summarizeIfNeeded()

    const history = conversationManager.getMessages()

    // Use unique thread_id per message to avoid checkpoint state conflicts
    const threadId = `msg-${Date.now()}`
    // Store for potential HITL resume
    ;(win as any).__lastThreadId = threadId

    for await (const evt of agentModule.streamMessage(
      message,
      history.slice(0, -1),
      threadId,
      searchEnabled ?? true,
    )) {
      if (!win || win.isDestroyed()) break

      switch (evt.type) {
        case 'token':
          win.webContents.send('agent:stream:token', { content: evt.content })
          break
        case 'step':
          win.webContents.send('agent:stream:step', { category: (evt as any).category, summary: evt.summary })
          break
        case 'interrupt': {
          const data = (evt as any).interruptData
          if (data?.type === 'clarify') {
            win.webContents.send('agent:clarify', {
              id: Date.now().toString(),
              question: data.question,
              options: data.options || [],
            })
            // 60-second timeout
            setTimeout(() => {
              if (!win.isDestroyed()) {
                win.webContents.send('agent:stream:error', {
                  message: '응답 시간이 초과되었습니다.',
                  errorType: 'timeout',
                })
              }
            }, 60000)
          } else if (data?.type === 'confirm') {
            win.webContents.send('agent:confirm', {
              id: Date.now().toString(),
              action: data.action,
              description: data.description,
              scriptId: data.scriptId,
            })
            setTimeout(() => {
              if (!win.isDestroyed()) {
                win.webContents.send('agent:stream:error', {
                  message: '사용자 확인 시간이 초과되었습니다.',
                  errorType: 'timeout',
                })
              }
            }, 60000)
          }
          break
        }
        case 'done': {
          const { AIMessage } = await import('@langchain/core/messages')
          conversationManager.addMessage(new AIMessage(evt.response))
          win.webContents.send('agent:stream:done', {
            response: evt.response,
            agentName: evt.agentName,
            diagnosticResults: evt.diagnosticResults ?? null,
            sources: (evt as any).sources ?? [],
            tokenUsage: (evt as any).tokenUsage ?? {},
          })
          break
        }
      }
    }
  } catch (err) {
    const error = err as any
    // Handle GraphInterrupt — send confirm/clarify request to renderer
    if (error?.name === 'GraphInterrupt' || error?.interrupts) {
      const interrupts = error.interrupts || error.value || []
      const interruptData = Array.isArray(interrupts) ? interrupts[0]?.value : interrupts

      if (interruptData?.type === 'confirm') {
        win.webContents.send('agent:confirm', {
          id: Date.now().toString(),
          action: interruptData.action,
          description: interruptData.description,
          scriptId: interruptData.scriptId,
        })
        // 60-second timeout
        setTimeout(() => {
          if (!win.isDestroyed()) {
            win.webContents.send('agent:stream:error', {
              message: '사용자 확인 시간이 초과되었습니다.',
              errorType: 'timeout',
            })
          }
        }, 60000)
        return
      }

      if (interruptData?.type === 'clarify') {
        win.webContents.send('agent:clarify', {
          id: Date.now().toString(),
          question: interruptData.question,
          options: interruptData.options || [],
        })
        setTimeout(() => {
          if (!win.isDestroyed()) {
            win.webContents.send('agent:stream:error', {
              message: '응답 시간이 초과되었습니다.',
              errorType: 'timeout',
            })
          }
        }, 60000)
        return
      }
    }

    const errorMessage = err instanceof Error ? err.message : String(err)
    win.webContents.send('agent:stream:error', {
      message: errorMessage,
      errorType: 'unknown',
    })
  }
})

// ─── HITL Handlers — resume graph after interrupt ───

async function resumeAndStream(win: BrowserWindow, resumeValue: unknown) {
  if (!agentModule) return
  try {
    const threadId = (win as any).__lastThreadId || 'main-thread'
    for await (const evt of agentModule.resumeGraph(threadId, resumeValue)) {
      if (win.isDestroyed()) break
      switch (evt.type) {
        case 'token':
          win.webContents.send('agent:stream:token', { content: evt.content })
          break
        case 'done':
          win.webContents.send('agent:stream:done', {
            response: evt.response,
            agentName: evt.agentName,
            diagnosticResults: evt.diagnosticResults ?? null,
          })
          break
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!win.isDestroyed()) {
      win.webContents.send('agent:stream:error', { message: msg, errorType: 'unknown' })
    }
  }
}

ipcMain.on('agent:confirm:response', (event, response) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  resumeAndStream(win, response.confirmed)
})

ipcMain.on('agent:clarify:response', (event, response) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  const combined = [...(response.selected || []), response.freeText].filter(Boolean).join(', ')
  resumeAndStream(win, combined)
})

// ─── Search Toggle ───

ipcMain.on('agent:search:toggle', (_event, { enabled }) => {
  console.log('[Search] Toggle:', enabled)
})
