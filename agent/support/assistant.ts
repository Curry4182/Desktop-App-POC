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
