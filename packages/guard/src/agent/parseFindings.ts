import type { AssistantMessage } from '@earendil-works/pi-ai'
import { z } from 'zod'
import type { GuardEvalResult } from '../types.js'

const GuardFindingSchema = z.object({
  severity: z.enum(['info', 'warning', 'error']),
  rule: z.string().optional(),
  file: z.string().optional(),
  line: z.number().optional(),
  message: z.string(),
  evidence: z.string().optional(),
  suggestion: z.string().optional(),
})

const GuardEvalResultSchema = z.object({
  summary: z.string(),
  findings: z.array(GuardFindingSchema),
  passed: z.boolean(),
})

function fallback(): GuardEvalResult {
  return {
    summary: 'Parse error',
    findings: [],
    passed: true,
  }
}

export function parseFindings(message: AssistantMessage): GuardEvalResult {
  const text = message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
  const match = text.match(/```json\s*([\s\S]*?)```/)

  if (!match) {
    return fallback()
  }

  try {
    return GuardEvalResultSchema.parse(JSON.parse(match[1]))
  } catch {
    return fallback()
  }
}
