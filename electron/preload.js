const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  sendMessage: (message, searchEnabled) => {
    ipcRenderer.send('agent:message', { message, searchEnabled })
  },

  onStreamToken: (callback) => {
    ipcRenderer.on('stream:token', (_event, data) => callback(data))
  },
  onStreamCustom: (callback) => {
    ipcRenderer.on('stream:custom', (_event, data) => callback(data))
  },
  onStreamDone: (callback) => {
    ipcRenderer.on('stream:done', (_event, data) => callback(data))
  },
  onStreamError: (callback) => {
    ipcRenderer.on('stream:error', (_event, data) => callback(data))
  },
  onStreamInterrupt: (callback) => {
    ipcRenderer.on('stream:interrupt', (_event, data) => callback(data))
  },

  sendConfirmResponse: (response) => {
    ipcRenderer.send('agent:confirm:response', response)
  },
  sendClarifyResponse: (response) => {
    ipcRenderer.send('agent:clarify:response', response)
  },

  resetConversation: () => {
    ipcRenderer.send('agent:reset')
  },

  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel)
  },
})
