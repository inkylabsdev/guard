import type { Api, Model } from '@earendil-works/pi-ai'
import { runAgentLoop } from '@earendil-works/pi-agent-core'
import type { GuardEvalResult, GuardTarget, ResolvedGuardPolicy } from '../types.js'
import { buildInitialUserMessage, buildSystemPrompt } from './buildPrompts.js'
import { parseFindings } from './parseFindings.js'

export async function runGuardAgent(
  policy: ResolvedGuardPolicy,
  target: GuardTarget,
  model: Model<Api>,
  targetSummary?: string,
): Promise<GuardEvalResult> {
  let result: GuardEvalResult | undefined

  await runAgentLoop(
    [buildInitialUserMessage(policy, target, targetSummary)],
    { systemPrompt: buildSystemPrompt(), messages: [], tools: [] },
    {
      model,
      /* c8 ignore next 3 */
      convertToLlm: (messages) =>
        messages.filter((message) =>
          message.role === 'user' || message.role === 'assistant' || message.role === 'toolResult'),
      shouldStopAfterTurn: ({ message }) => {
        result = parseFindings(message)
        return true
      },
      getSteeringMessages: async () => [],
    },
    () => {},
  )

  /* c8 ignore next 3 */
  if (!result) {
    throw new Error('Guard agent produced no result')
  }

  return result
}
