export type GuardConfig = {
  model: string
  provider: 'openai' | 'anthropic' | 'mock'
  max_iterations: number
  severity_threshold: 'info' | 'warning' | 'error'
  include: GuardInclude[]
}

export type GuardInclude =
  | string
  | { github: string; ref?: string; path?: string }

export type GuardFile = {
  path: string
  content: string
}

export type GuardTarget = {
  mode: 'diff' | 'files' | 'stdin'
  files: GuardFile[]
  raw?: string
}

export type GuardFinding = {
  severity: 'info' | 'warning' | 'error'
  rule?: string
  file?: string
  line?: number
  message: string
  evidence?: string
  suggestion?: string
}

export type ResolvedGuardPolicy = {
  policyPath: string
  content: string
  config: GuardConfig
}

export type LLMEvaluateInput = {
  systemPrompt: string
  userPrompt: string
  policyMarkdown: string
  targetContent: string
  iteration: number
}

export type LLMEvaluateResult = {
  summary: string
  findings: GuardFinding[]
  passed: boolean
}

export type AgentInput = {
  policy: ResolvedGuardPolicy
  target: GuardTarget
  config: GuardConfig
}
