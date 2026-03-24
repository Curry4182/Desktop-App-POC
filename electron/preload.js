const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Fire-and-forget message send
  sendMessage: (message, searchEnabled) => {
    ipcRenderer.send('agent:message', { message, searchEnabled })
  },

  // Streaming listeners
  onStreamToken: (callback) => {
    ipcRenderer.on('agent:stream:token', (_event, data) => callback(data))
  },
  onStreamStep: (callback) => {
    ipcRenderer.on('agent:stream:step', (_event, data) => callback(data))
  },
  onStreamDone: (callback) => {
    ipcRenderer.on('agent:stream:done', (_event, data) => callback(data))
  },
  onStreamError: (callback) => {
    ipcRenderer.on('agent:stream:error', (_event, data) => callback(data))
  },

  // HITL listeners & senders
  onConfirmRequest: (callback) => {
    ipcRenderer.on('agent:confirm', (_event, data) => callback(data))
  },
  sendConfirmResponse: (response) => {
    ipcRenderer.send('agent:confirm:response', response)
  },
  onClarifyRequest: (callback) => {
    ipcRenderer.on('agent:clarify', (_event, data) => callback(data))
  },
  sendClarifyResponse: (response) => {
    ipcRenderer.send('agent:clarify:response', response)
  },

  // Search toggle
  toggleSearch: (enabled) => {
    ipcRenderer.send('agent:search:toggle', { enabled })
  },

  // Cleanup
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel)
  },
})
