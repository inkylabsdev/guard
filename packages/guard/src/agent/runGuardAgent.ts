import type { Api, Model } from '@earendil-works/pi-ai'
import { runAgentLoop } from '@earendil-works/pi-agent-core'
import type { RuntimeConfig, GuardEvalResult, GuardFinding, GuardTarget, ResolvedGuardPolicy } from '../types.js'
import { buildFollowUpPrompt, buildInitialUserMessage, buildSystemPrompt } from './buildPrompts.js'
import { parseFindings } from './parseFindings.js'

export async function runGuardAgent(
  policy: ResolvedGuardPolicy,
  target: GuardTarget,
  runtime: RuntimeConfig,
  model: Model<Api>,
): Promise<GuardEvalResult> {
  let turnCount = 0
  // pi-agent-core polls steering once before the first request.
  let hasCompletedTurn = false
  const allFindings: GuardFinding[] = []
  let summary = ''

  await runAgentLoop(
    [buildInitialUserMessage(policy, target)],
    { systemPrompt: buildSystemPrompt(), messages: [], tools: [] },
    {
      model,
      convertToLlm: (messages) =>
        messages.filter((message) =>
          message.role === 'user' || message.role === 'assistant' || message.role === 'toolResult'),
      shouldStopAfterTurn: ({ message }) => {
        const result = parseFindings(message)
        summary = result.summary
        for (const finding of result.findings) {
          if (!allFindings.some((existing) =>
            existing.rule === finding.rule && existing.message === finding.message)) {
            allFindings.push(finding)
          }
        }
        turnCount++
        hasCompletedTurn = true
        return result.passed || turnCount >= runtime.max_iterations
      },
      getSteeringMessages: async () =>
        hasCompletedTurn
          ? [{ role: 'user', content: buildFollowUpPrompt(), timestamp: Date.now() }]
          : [],
    },
    () => {},
  )

  return {
    summary,
    findings: allFindings,
    passed: allFindings.length === 0,
  }
}
