/**
 * 배치 스크립트 레지스트리 및 실행 결과 타입.
 */
export interface ScriptEntry {
  id: string
  name: string
  description: string
  file: string
  platform: 'windows' | 'macos' | 'linux'
  symptoms: string[]
  category: string
}

export interface ScriptRegistry {
  scripts: ScriptEntry[]
}
