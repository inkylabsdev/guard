import { readFileSync } from 'fs'
import matter from 'gray-matter'
import { z } from 'zod'
import type { ParsedGuardRule } from '../types.js'

const ruleId = z.string().regex(/^[A-Za-z0-9_-]+$/, 'rule id must contain only letters, numbers, "_" or "-"')

const GuardRuleSchema = z.object({
  id: ruleId,
  severity: z.enum(['info', 'warning', 'error']),
  description: z.string().min(1),
  depends_on: z.array(ruleId).optional(),
})

export function parseGuardRuleFile(filePath: string): ParsedGuardRule {
  const raw = readFileSync(filePath, 'utf8')
  const { data, content } = matter(raw)
  const parsed = GuardRuleSchema.parse(data)
  return {
    id: parsed.id,
    severity: parsed.severity,
    description: parsed.description,
    depends_on: parsed.depends_on ?? [],
    body: content.trim(),
  }
}
