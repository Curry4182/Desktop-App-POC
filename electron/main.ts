import { app, BrowserWindow, ipcMain, type WebContents } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'
import 'dotenv/config'
import { getScriptById } from '../agent/support/scripts.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

type AgentModule = typeof import('../agent/graph.js')

type SessionState = {
  threadId: string
  searchEnabled: boolean
}

type ActiveRequest = {
  requestId: string
  controller: AbortController
}

type ClarifyInterrupt = {
  type: 'clarify'
  question: string
  options?: Array<{ label: string; value: string }>
}

type HitlActionRequest = {
  name: string
  args?: Record<string, unknown>
  description?: string
}

type HitlRequest = {
  actionRequests?: HitlActionRequest[]
  reviewConfigs?: Array<{ actionName: string; allowedDecisions: string[] }>
  action_requests?: HitlActionRequest[]
  review_configs?: Array<{ action_name: string; allowed_decisions: string[] }>
}

let mainWindow: BrowserWindow | null = null
let agentModule: AgentModule | null = null

const sessions = new Map<number, SessionState>()
const hitlTimeouts = new Map<number, NodeJS.Timeout>()
const activeRequests = new Map<number, ActiveRequest>()

function createThreadId() {
  return `session-${randomUUID()}`
}

function getSession(sender: WebContents): SessionState {
  const existing = sessions.get(sender.id)
  if (existing) return existing

  const created = {
    threadId: createThreadId(),
    searchEnabled: true,
  }
  sessions.set(sender.id, created)
  return created
}

function resetSession(sender: WebContents) {
  sessions.set(sender.id, {
    threadId: createThreadId(),
    searchEnabled: true,
  })
}

function clearHitlTimeout(senderId: number) {
  const timeout = hitlTimeouts.get(senderId)
  if (!timeout) return
  clearTimeout(timeout)
  hitlTimeouts.delete(senderId)
}

function abortActiveRequest(senderId: number) {
  const active = activeRequests.get(senderId)
  if (!active) return
  active.controller.abort()
  activeRequests.delete(senderId)
}

function startActiveRequest(senderId: number): ActiveRequest {
  abortActiveRequest(senderId)
  const active = {
    requestId: randomUUID(),
    controller: new AbortController(),
  }
  activeRequests.set(senderId, active)
  return active
}

function isActiveRequest(senderId: number, requestId: string) {
  return activeRequests.get(senderId)?.requestId === requestId
}

function finishActiveRequest(senderId: number, requestId: string) {
  if (!isActiveRequest(senderId, requestId)) return
  activeRequests.delete(senderId)
}

function setHitlTimeout(win: BrowserWindow) {
  clearHitlTimeout(win.webContents.id)
  const timeout = setTimeout(() => {
    if (!win.isDestroyed()) {
      win.webContents.send('stream:error', { message: '응답 시간이 초과되었습니다.' })
    }
  }, 60000)
  hitlTimeouts.set(win.webContents.id, timeout)
}

function isClarifyInterrupt(value: unknown): value is ClarifyInterrupt {
  return !!value
    && typeof value === 'object'
    && (value as ClarifyInterrupt).type === 'clarify'
    && typeof (value as ClarifyInterrupt).question === 'string'
}

function isHitlRequest(value: unknown): value is HitlRequest {
  if (!value || typeof value !== 'object') return false
  const data = value as HitlRequest
  return Array.isArray(data.actionRequests)
    || Array.isArray(data.reviewConfigs)
    || Array.isArray(data.action_requests)
    || Array.isArray(data.review_configs)
}

function normalizeActionRequests(value: HitlRequest): HitlActionRequest[] {
  return value.actionRequests ?? value.action_requests ?? []
}

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
    if (mainWindow) {
      abortActiveRequest(mainWindow.webContents.id)
      clearHitlTimeout(mainWindow.webContents.id)
      sessions.delete(mainWindow.webContents.id)
    }
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

async function streamToWindow(
  win: BrowserWindow,
  senderId: number,
  requestId: string,
  streamFactory: () => AsyncIterable<{ type: string; [key: string]: any }>,
) {
  try {
    for await (const evt of streamFactory()) {
      if (win.isDestroyed() || !isActiveRequest(senderId, requestId)) break

      switch (evt.type) {
        case 'token':
          win.webContents.send('stream:token', { content: evt.content, node: evt.node })
          break
        case 'custom':
          win.webContents.send('stream:custom', evt.data)
          break
        case 'interrupt': {
          const data = evt.data
          if (isClarifyInterrupt(data)) {
            win.webContents.send('stream:interrupt', {
              interruptType: 'clarify',
              id: Date.now().toString(),
              question: data.question,
              options: data.options || [],
            })
          } else if (isHitlRequest(data)) {
            const action = normalizeActionRequests(data)[0]
            const scriptId = typeof action?.args?.scriptId === 'string' ? action.args.scriptId : undefined
            const scriptEntry = scriptId ? getScriptById(scriptId) : undefined
            win.webContents.send('stream:interrupt', {
              interruptType: 'confirm',
              id: Date.now().toString(),
              action: scriptEntry?.name || action?.name || 'run_script',
              description: action?.description || '도구 실행 승인 요청',
              scriptId,
            })
          } else {
            win.webContents.send('stream:error', {
              message: '지원하지 않는 인터럽트 형식입니다.',
            })
          }
          setHitlTimeout(win)
          finishActiveRequest(senderId, requestId)
          return
        }
        case 'done':
          clearHitlTimeout(win.webContents.id)
          win.webContents.send('stream:done', {
            tokenUsage: evt.tokenUsage ?? {},
          })
          finishActiveRequest(senderId, requestId)
          break
      }
    }
    finishActiveRequest(senderId, requestId)
  } catch (err) {
    finishActiveRequest(senderId, requestId)
    clearHitlTimeout(win.webContents.id)
    if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'))) {
      return
    }
    if (!win.isDestroyed()) {
      const message = err instanceof Error ? err.message : String(err)
      win.webContents.send('stream:error', { message })
    }
  }
}

ipcMain.on('agent:reset', (event) => {
  abortActiveRequest(event.sender.id)
  resetSession(event.sender)
  clearHitlTimeout(event.sender.id)
})

ipcMain.on('agent:message', async (event, { message, searchEnabled }) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || !agentModule) return

  const session = getSession(event.sender)
  session.searchEnabled = searchEnabled ?? true
  clearHitlTimeout(event.sender.id)
  const active = startActiveRequest(event.sender.id)

  await streamToWindow(win, event.sender.id, active.requestId, () => agentModule!.streamGraph({
    userMessage: message,
    threadId: session.threadId,
    searchEnabled: session.searchEnabled,
    signal: active.controller.signal,
  }))
})

async function resumeAndStream(win: BrowserWindow, sender: WebContents, resumeValue: unknown) {
  if (!agentModule) return
  const session = getSession(sender)
  clearHitlTimeout(sender.id)
  const active = startActiveRequest(sender.id)

  await streamToWindow(win, sender.id, active.requestId, () => agentModule!.resumeGraph({
    resumeValue,
    threadId: session.threadId,
    searchEnabled: session.searchEnabled,
    signal: active.controller.signal,
  }))
}

ipcMain.on('agent:confirm:response', async (event, response) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return

  await resumeAndStream(win, event.sender, {
    decisions: [
      response.confirmed
        ? { type: 'approve' }
        : { type: 'reject', message: '사용자가 도구 실행을 거부했습니다.' },
    ],
  })
})

ipcMain.on('agent:clarify:response', async (event, response) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return

  const combined = [...(response.selected || []), response.freeText]
    .filter(Boolean)
    .join(', ')

  await resumeAndStream(win, event.sender, combined)
})
