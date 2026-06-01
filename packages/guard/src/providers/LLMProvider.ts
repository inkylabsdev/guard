import type { LLMEvaluateInput, LLMEvaluateResult } from '../types.js'

export interface LLMProvider {
  name: string
  evaluate(input: LLMEvaluateInput): Promise<LLMEvaluateResult>
}
