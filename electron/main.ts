import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { pathToFileURL } from 'url'

// 개발 환경 감지
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWindow: BrowserWindow | null = null
let agentModule: { processMessage: (msg: string, history: unknown[]) => Promise<unknown> } | null = null

/**
 * LangGraph Agent 동적 임포트 (TypeScript ESM 모듈)
 */
async function loadAgent() {
  if (agentModule) return agentModule
  try {
    const agentPath = path.join(__dirname, '../agent/graph.ts')
    const agentUrl = pathToFileURL(agentPath).href
    agentModule = await import(agentUrl) as typeof agentModule
    console.log('[Main] 에이전트 로드 성공')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Main] 에이전트 로드 실패:', message)
    agentModule = null
  }
  return agentModule
}

/**
 * BrowserWindow 생성
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // ESM agent 모듈 로드를 위해 필요
    },
    titleBarStyle: 'default',
    show: false, // 로딩 완료 후 표시
  })

  // 개발: Vite dev server, 프로덕션: 빌드된 index.html
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/**
 * IPC 핸들러: 사용자 메시지 → LangGraph → 응답
 */
ipcMain.handle('agent:message', async (_event, { message, history }: { message: string; history: unknown[] }) => {
  console.log(`[IPC] 메시지 수신: "${message.slice(0, 50)}..."`)

  const agent = await loadAgent()

  if (!agent) {
    return {
      response: 'Agent를 로드할 수 없습니다. .env 파일의 API 키를 확인하세요.',
      route: 'error',
      uiAction: null,
      diagnosticResults: null,
    }
  }

  try {
    const result = await agent.processMessage(message, history) as {
      response: string
      route: string
      uiAction: unknown
      diagnosticResults: unknown
    }
    console.log(`[IPC] 응답 라우트: ${result.route}`)

    // UI 액션이 있으면 renderer에 별도로 전송
    if (result.uiAction && mainWindow) {
      mainWindow.webContents.send('ui:action', result.uiAction)
    }

    return result
  } catch (err) {
    const message_ = err instanceof Error ? err.message : String(err)
    console.error('[IPC] 에이전트 오류:', message_)
    return {
      response: `처리 중 오류가 발생했습니다: ${message_}`,
      route: 'error',
      uiAction: null,
      diagnosticResults: null,
    }
  }
})

/**
 * App 이벤트
 */
app.whenReady().then(async () => {
  // .env 로드
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dotenv = require('dotenv') as { config: (opts: { path: string }) => void }
    dotenv.config({ path: path.join(__dirname, '../.env') })
    console.log('[Main] 환경 변수 로드 완료')
  } catch {
    console.warn('[Main] dotenv 로드 실패')
  }

  // Agent 사전 로드 (첫 메시지 지연 방지)
  await loadAgent()

  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
