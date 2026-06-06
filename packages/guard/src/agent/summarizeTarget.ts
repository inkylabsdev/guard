import type { Api, AssistantMessage, Model } from '@earendil-works/pi-ai'
import { runAgentLoop } from '@earendil-works/pi-agent-core'
import { z } from 'zod'
import type { GuardTarget } from '../types.js'
import { buildSummarizerUserMessage } from './buildPrompts.js'

const TargetSummarySchema = z.object({
  changed_files: z.array(z.string()),
  affected_areas: z.array(z.string()),
  behavior_changes: z.string(),
})

type TargetSummary = z.infer<typeof TargetSummarySchema>

function parseSummary(message: AssistantMessage): TargetSummary {
  const text = message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
  const match = text.match(/```json\s*([\s\S]*?)```/)
  if (!match) {
    throw new Error('missing summary JSON block')
  }
  return TargetSummarySchema.parse(JSON.parse(match[1]))
}

function formatSummary(summary: TargetSummary): string {
  return [
    `Changed files: ${summary.changed_files.join(', ') || 'none'}`,
    `Affected areas: ${summary.affected_areas.join(', ') || 'none'}`,
    `Behavior changes: ${summary.behavior_changes}`,
  ].join('\n')
}

export async function summarizeTarget(target: GuardTarget, model: Model<Api>): Promise<string | undefined> {
  let summary: TargetSummary | undefined

  await runAgentLoop(
    [buildSummarizerUserMessage(target)],
    { systemPrompt: 'You summarize changed input for Guard. Do not evaluate policies.', messages: [], tools: [] },
    {
      model,
      /* c8 ignore next 3 */
      convertToLlm: (messages) =>
        messages.filter((message) =>
          message.role === 'user' || message.role === 'assistant' || message.role === 'toolResult'),
      shouldStopAfterTurn: ({ message }) => {
        summary = parseSummary(message)
        return true
      },
      getSteeringMessages: async () => [],
    },
    () => {},
  )

  /* c8 ignore next */
  return summary ? formatSummary(summary) : undefined
}
