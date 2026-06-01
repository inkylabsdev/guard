import { readFileSync } from 'fs'
import matter from 'gray-matter'
import { z } from 'zod'
import type { GuardConfig } from '../types.js'

const GuardIncludeSchema = z.union([
  z.string(),
  z.object({ github: z.string(), ref: z.string().optional(), path: z.string().optional() }),
])

const GuardConfigSchema = z.object({
  model: z.string().optional(),
  provider: z.enum(['openai', 'anthropic', 'mock']).optional(),
  max_iterations: z.number().int().positive().optional(),
  severity_threshold: z.enum(['info', 'warning', 'error']).optional(),
  include: z.array(GuardIncludeSchema).optional(),
})

const defaults: GuardConfig = {
  model: 'mock',
  provider: 'mock',
  max_iterations: 3,
  severity_threshold: 'info',
  include: [],
}

export type ParsedGuardFile = {
  config: GuardConfig
  body: string
}

export function parseGuardFile(filePath: string): ParsedGuardFile {
  const raw = readFileSync(filePath, 'utf8')
  const { data, content } = matter(raw)
  const parsed = GuardConfigSchema.parse(data)
  return {
    config: { ...defaults, ...Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== undefined)) } as GuardConfig,
    body: content.trim(),
  }
}
