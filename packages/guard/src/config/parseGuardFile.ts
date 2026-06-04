import { readFileSync } from 'fs'
import matter from 'gray-matter'
import { z } from 'zod'
import type { GuardConfig } from '../types.js'
import { DEPENDENCY_NAME_RE } from './registry.js'

const GuardIncludeSchema = z.union([
  z.string(),
  z.object({ github: z.string(), ref: z.string().optional(), path: z.string().optional() }),
])

const GuardConfigSchema = z.object({
  severity_threshold: z.enum(['info', 'warning', 'error']).optional(),
  include: z.array(GuardIncludeSchema).optional(),
  dependencies: z.array(z.string().regex(DEPENDENCY_NAME_RE)).optional(),
})

const defaults: GuardConfig = {
  severity_threshold: 'info',
  include: [],
  dependencies: [],
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
