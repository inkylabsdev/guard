export type GuardConfig = {
  severity_threshold: 'info' | 'warning' | 'error'
  include: GuardInclude[]
  dependencies: string[]
}

export type RuntimeConfig = {
  provider: 'openai' | 'anthropic' | 'mock'
  model: string
  concurrency: number
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
  score: number
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

export type GuardEvalResult = {
  summary: string
  findings: GuardFinding[]
  passed: boolean
}

export type GuardRuleSeverity = GuardFinding['severity']

export type ParsedGuardRule = {
  id: string
  severity: GuardRuleSeverity
  description: string
  depends_on: string[]
  body: string
}

export type GuardRule = ParsedGuardRule & {
  ruleDir: string
  guardPath: string
}

export type GuardPackage = {
  id: string
  rootDir: string
  manifestPath: string
  guardPath?: string
  guardContent?: string
  dependsOn: string[]
  rules: GuardRule[]
}

export type RegistryPackage = {
  name: string
  description: string
  license: string
  homepage: string
  url: string
}

export type RuleResult = {
  rule_id: string
  status: 'pass' | 'fail' | 'error' | 'abort'
  findings: GuardFinding[]
  filtered_findings: number
  summary: string
}

export type PackageEvalResult = {
  summary: string
  findings: GuardFinding[]
  passed: boolean
  ruleResults: RuleResult[]
}
