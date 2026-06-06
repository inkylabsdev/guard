import type { AssistantMessage } from '@earendil-works/pi-ai'
import { z } from 'zod'
import type { GuardEvalResult } from '../types.js'

export class GuardParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GuardParseError'
  }
}

const GuardFindingSchema = z.object({
  severity: z.enum(['info', 'warning', 'error']),
  score: z.number().int().min(0).max(100),
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

export function parseFindings(message: AssistantMessage): GuardEvalResult {
  const text = message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
  const match = text.match(/```json\s*([\s\S]*?)```/)

  if (!match) {
    throw new GuardParseError('Parse error: missing JSON block')
  }

  try {
    return GuardEvalResultSchema.parse(JSON.parse(match[1]))
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new GuardParseError(`Parse error: ${err.message}`)
    }
    throw new GuardParseError('Parse error: invalid result shape')
  }
}
