<template>
  <div class="diagnostic-panel">
    <div class="panel-header">
      <h2>PC 진단 결과</h2>
      <button @click="chatStore.showDiagnosticPanel = false" class="close-btn">✕</button>
    </div>
    <div class="panel-body" v-if="result">
      <section>
        <h3>시스템 정보</h3>
        <div class="info-grid">
          <div class="info-item">
            <span class="label">OS</span>
            <span class="value">{{ result.system?.os?.distro }} {{ result.system?.os?.release }} ({{ result.system?.os?.arch }})</span>
          </div>
          <div class="info-item">
            <span class="label">호스트명</span>
            <span class="value">{{ result.system?.os?.hostname }}</span>
          </div>
          <div class="info-item">
            <span class="label">CPU</span>
            <span class="value">{{ result.system?.cpu?.manufacturer }} {{ result.system?.cpu?.brand }} ({{ result.system?.cpu?.cores }}코어)</span>
          </div>
          <div class="info-item">
            <span class="label">메모리</span>
            <span class="value">{{ result.system?.memory?.usedGB }}GB / {{ result.system?.memory?.totalGB }}GB ({{ result.system?.memory?.usedPercent }}%)</span>
          </div>
        </div>
      </section>

      <section v-if="result.system?.gpu?.length">
        <h3>GPU</h3>
        <div class="info-grid">
          <div
            v-for="(gpu, idx) in result.system.gpu"
            :key="idx"
            class="info-item"
          >
            <span class="label">{{ gpu.vendor }}</span>
            <span class="value">{{ gpu.model }} ({{ gpu.vramMB }}MB)</span>
          </div>
        </div>
      </section>

      <section v-if="result.system?.disks?.length">
        <h3>디스크 용량</h3>
        <div v-for="disk in result.system.disks" :key="disk.mount" class="disk-item">
          <div class="disk-header">
            <span class="drive-name">{{ disk.mount }} <span class="disk-fs-type">{{ disk.type }}</span></span>
            <span class="drive-info">여유 {{ disk.freeGB }}GB / 전체 {{ disk.totalGB }}GB</span>
          </div>
          <div class="disk-bar">
            <div class="disk-used" :style="{ width: disk.usedPercent + '%' }"
              :class="{ warn: parseFloat(disk.usedPercent) > 80 }"></div>
          </div>
          <span class="disk-percent">{{ disk.usedPercent }}% 사용중</span>
        </div>
      </section>

      <section>
        <h3>설치된 프로그램</h3>
        <div class="program-list">
          <div
            v-for="program in result.installedPrograms"
            :key="program.name"
            class="check-item"
          >
            <span class="status-dot ok"></span>
            <span class="path">{{ program.name }}</span>
            <span v-if="program.version" class="status-label ok">{{ program.version }}</span>
          </div>
          <div v-if="!result.installedPrograms?.length" class="empty-programs">
            프로그램 목록을 가져올 수 없습니다.
          </div>
        </div>
      </section>

      <section v-if="result.filePaths && Object.keys(result.filePaths).length">
        <h3>파일 경로 확인</h3>
        <div
          v-for="(info, filePath) in result.filePaths"
          :key="filePath"
          class="check-item"
        >
          <span class="status-dot" :class="info.exists ? 'ok' : 'fail'"></span>
          <span class="path">{{ filePath }}</span>
          <span class="status-label" :class="info.exists ? 'ok' : 'fail'">
            {{ info.exists ? '존재' : '없음' }}
          </span>
        </div>
      </section>

      <section>
        <h3>네트워크 상태</h3>
        <div
          v-for="(info, host) in result.network"
          :key="host"
          class="check-item"
        >
          <span class="status-dot" :class="info.reachable ? 'ok' : 'fail'"></span>
          <span class="path">{{ host }}</span>
          <span class="status-label" :class="info.reachable ? 'ok' : 'fail'">
            {{ info.reachable ? '연결됨' : '연결 안됨' }}
          </span>
        </div>
      </section>
    </div>
    <div v-else class="empty-state">
      진단 결과가 없습니다.<br>채팅에서 진단을 요청하세요.
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useChatStore } from '../stores/chat.js'

const chatStore = useChatStore()
const result = computed(() => chatStore.lastDiagnosticResult)
</script>

<style scoped>
.diagnostic-panel {
  width: 360px;
  background: #D7E3F1;
  border-left: 1px solid #c7d9ec;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
}

.panel-header {
  padding: 0 16px;
  height: 52px;
  border-bottom: 1px solid #c7d9ec;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #002C5F;
  flex-shrink: 0;
}

.panel-header h2 {
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  letter-spacing: -0.01em;
}

.close-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
  transition: color 0.15s;
}

.close-btn:hover {
  color: #ffffff;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.panel-body::-webkit-scrollbar {
  width: 4px;
}
.panel-body::-webkit-scrollbar-thumb {
  background: #a4c0dc;
  border-radius: 2px;
}

section h3 {
  font-size: 11px;
  font-weight: 600;
  color: #002C5F;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid #c7d9ec;
}

.info-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  padding: 4px 0;
}

.label {
  color: #64748b;
  font-weight: 500;
  flex-shrink: 0;
}

.value {
  color: #1e293b;
  font-weight: 500;
  text-align: right;
  font-size: 11px;
  word-break: break-all;
}

.program-list {
  max-height: 200px;
  overflow-y: auto;
}

.program-list::-webkit-scrollbar {
  width: 3px;
}
.program-list::-webkit-scrollbar-thumb {
  background: #a4c0dc;
  border-radius: 2px;
}

.check-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 5px 0;
  border-bottom: 1px solid rgba(199, 217, 236, 0.5);
}

.check-item:last-child {
  border-bottom: none;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-dot.ok { background: #278D0D; }
.status-dot.fail { background: #ef4444; }

.path {
  color: #1e293b;
  word-break: break-all;
  font-size: 11px;
  flex: 1;
}

.status-label {
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}
.status-label.ok { color: #278D0D; }
.status-label.fail { color: #ef4444; }

.empty-programs {
  font-size: 11px;
  color: #64748b;
  padding: 8px 0;
}

.disk-item {
  font-size: 12px;
  margin-bottom: 10px;
}

.disk-item:last-child {
  margin-bottom: 0;
}

.disk-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.drive-name {
  color: #1e293b;
  font-weight: 600;
}

.disk-fs-type {
  font-size: 10px;
  color: #64748b;
  font-weight: 400;
  margin-left: 4px;
}

.drive-info {
  font-size: 11px;
  color: #64748b;
}

.disk-bar {
  height: 6px;
  background: #c7d9ec;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 4px;
}

.disk-used {
  height: 100%;
  background: #278D0D;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.disk-used.warn { background: #fbbf24; }

.disk-percent {
  font-size: 11px;
  color: #64748b;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  font-size: 13px;
  text-align: center;
  padding: 24px;
  line-height: 1.6;
}
</style>
