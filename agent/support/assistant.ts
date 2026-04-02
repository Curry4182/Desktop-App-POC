/**
 * 어시스턴트 ReAct 에이전트.
 *
 * 일반 대화, 후속 설명, PC 진단/수리를 담당한다.
 * 6개의 도구를 사용할 수 있으며, run_script 도구는
 * humanInTheLoopMiddleware로 사용자 승인을 요구한다.
 *
 * 사용 가능한 도구:
 * - get_system_info       : OS/CPU/메모리/GPU/디스크 정보
 * - get_installed_programs: 설치된 프로그램 목록
 * - check_network         : DNS/포트 연결 확인
 * - run_full_diagnostic   : 종합 PC 진단
 * - list_scripts          : 등록된 수정 스크립트 목록
 * - run_script            : 수정 스크립트 실행 (사용자 승인 필요)
 */
import {
  createAgent,
  dynamicSystemPromptMiddleware,
  humanInTheLoopMiddleware,
  modelCallLimitMiddleware,
  toolCallLimitMiddleware,
} from 'langchain'
import { createLLM } from '../infra/llm.js'
import { chatNodePrompt } from '../app/prompts.js'
import type { AssistantAgentLike } from '../infra/runtime-types.js'
import {
  fullDiagnosticTool,
  installedProgramsTool,
  networkCheckTool,
  systemInfoTool,
} from './diagnostics.js'
import { formatScriptMetadata, listScriptsTool, scriptRunnerTool } from './scripts.js'

/** 기본 어시스턴트 에이전트를 생성한다 */
export function createDefaultAssistantAgent(): AssistantAgentLike {
  return createAgent({
    model: createLLM({ temperature: 0.2 }),
    tools: [
      systemInfoTool,
      installedProgramsTool,
      networkCheckTool,
      fullDiagnosticTool,
      listScriptsTool,
      scriptRunnerTool,
    ],
    middleware: [
      dynamicSystemPromptMiddleware<{ searchEnabled?: boolean }>((_state, runtime) => {
        const searchMode = runtime.context?.searchEnabled
          ? '외부 사실 확인이 필요한 질문은 자료조사 워크플로우로 라우팅될 수 있습니다.'
          : '검색이 꺼져 있습니다. 외부 사실 확인이 필요하면 사용자가 검색을 켜도록 안내하세요.'

        return `${chatNodePrompt}

## 역할
- 일반 대화, 후속 설명, PC 진단/수리 보조를 담당합니다.
- 위키 기반 다단계 사실조사는 별도 research workflow가 담당합니다.

## 검색 상태
${searchMode}`
      }),
      modelCallLimitMiddleware({
        runLimit: 6,
        exitBehavior: 'end',
      }),
      toolCallLimitMiddleware({
        runLimit: 8,
        exitBehavior: 'continue',
      }),
      humanInTheLoopMiddleware({
        interruptOn: {
          run_script: {
            allowedDecisions: ['approve', 'reject'],
            description: (toolCall) => {
              const scriptId = typeof toolCall.args?.scriptId === 'string'
                ? toolCall.args.scriptId
                : 'unknown'
              const metadata = typeof toolCall.args?.scriptId === 'string'
                ? formatScriptMetadata(toolCall.args.scriptId)
                : null
              return [
                '등록된 수정 스크립트 실행 요청',
                '',
                `scriptId: ${scriptId}`,
                metadata,
                `args: ${JSON.stringify(toolCall.args, null, 2)}`,
              ].filter(Boolean).join('\n')
            },
          },
        },
        descriptionPrefix: '도구 실행 승인 필요',
      }),
    ],
  })
}
