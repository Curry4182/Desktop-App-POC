import { interrupt } from '@langchain/langgraph'

export function requestClarification(question: string, options: string[]) {
  const parsedOptions = options.map((option) => ({ label: option, value: option }))
  parsedOptions.push({ label: '직접 입력', value: '' })

  return String(interrupt({
    type: 'clarify',
    question,
    options: parsedOptions,
  }) ?? '')
}
