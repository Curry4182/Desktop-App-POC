<template>
  <div class="app-wrapper">
    <div class="app-container">
      <div class="app">
        <header class="app-header">
          <h1>Design Assistant</h1>
          <span class="subtitle">CAD & PC 진단 AI</span>
        </header>
        <main class="app-body">
          <ChatWindow />
          <DiagnosticPanel v-if="chatStore.showDiagnosticPanel" />
        </main>
      </div>
    </div>
  </div>
</template>

<script setup>
import ChatWindow from './components/ChatWindow.vue'
import DiagnosticPanel from './components/DiagnosticPanel.vue'
import { useChatStore } from './stores/chat.js'

const chatStore = useChatStore()
</script>

<style>
@import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css");

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

body {
  font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background-color: #0a0a0a;
}

#app {
  width: 100%;
  height: 100%;
}

.app-wrapper {
  min-height: 100vh;
  width: 100vw;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #0a0a0a;
  padding: 20px;
}

.app-container {
  width: 1280px;
  height: 720px;
  min-width: 1280px;
  max-width: 1280px;
  min-height: 720px;
  max-height: 720px;
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  position: relative;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: #f3f5f6;
}

.app-header {
  background: #002C5F;
  padding: 0 24px;
  height: 52px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.app-header h1 {
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
  letter-spacing: -0.01em;
}

.subtitle {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  font-weight: 400;
}

.app-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}
</style>
