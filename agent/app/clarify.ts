import { interrupt } from '@langchain/langgraph'

/**
 * LangGraph의 interrupt()를 사용해 그래프 실행을 일시 중단하고
 * 프론트엔드에 명확화(clarification) UI를 요청한다.
 *
 * interrupt()가 호출되면 그래프가 중단되고,
 * 프론트엔드에서 사용자가 옵션을 선택한 뒤
 * resumeGraph()로 재개하면 선택값이 반환된다.
 *
 * @param question - 사용자에게 보여줄 질문 텍스트
 * @param options  - 선택 가능한 옵션 목록 (마지막에 '직접 입력' 자동 추가)
 * @returns 사용자가 선택한 값 (문자열) 또는 직접 입력한 텍스트
 */
export function requestClarification(question: string, options: string[]) {
  const parsedOptions = options.map((option) => ({ label: option, value: option }))
  parsedOptions.push({ label: '직접 입력', value: '' })

  return String(interrupt({
    type: 'clarify',
    question,
    options: parsedOptions,
  }))
}
