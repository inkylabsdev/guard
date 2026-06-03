import {
  fauxAssistantMessage,
  getModel,
  registerFauxProvider,
  type Api,
  type Context,
  type FauxResponseFactory,
  type Model,
} from '@earendil-works/pi-ai'
import type { RuntimeConfig, GuardFinding, GuardEvalResult } from '../types.js'

export type ModelHandle = {
  model: Model<Api>
  cleanup: () => void
}

function extractText(context: Context): string {
  return context.messages.flatMap((message) => {
    if (message.role === 'user') {
      return typeof message.content === 'string'
        ? [message.content]
        : message.content.filter((block) => block.type === 'text').map((block) => block.text)
    }

    return message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
  }).join('\n')
}

function extractTargetText(context: Context): string {
  const marker = '=== Content ===\n'
  for (const message of context.messages) {
    if (message.role === 'user' && typeof message.content === 'string' && message.content.includes(marker)) {
      return message.content.split(marker, 2)[1]
    }
  }
  return extractText(context)
}

function evaluateMockText(text: string): GuardEvalResult {
  const findings: GuardFinding[] = []

  if (/TODO_SECRET/.test(text)) {
    findings.push({
      severity: 'error',
      rule: 'secret-leak',
      message: 'Potential secret leakage via TODO_SECRET marker.',
      evidence: text.match(/.*TODO_SECRET.*/)?.[0]?.trim(),
      suggestion: 'Remove or redact secrets before committing.',
    })
  }

  if (/console\.log\(secret/.test(text)) {
    findings.push({
      severity: 'error',
      rule: 'secret-leak',
      message: 'Do not log secrets.',
      evidence: text.match(/.*console\.log\(secret.*/)?.[0]?.trim(),
      suggestion: 'Remove the secret from logs or mask it.',
    })
  }

  const catchEmptyMatch = text.match(/catch\s*\([^)]*\)\s*\{\s*\}/s)
  if (catchEmptyMatch) {
    findings.push({
      severity: 'warning',
      rule: 'empty-catch',
      message: 'Do not swallow errors silently.',
      evidence: catchEmptyMatch[0].trim(),
      suggestion: 'Log or rethrow the error inside the catch block.',
    })
  }

  return {
    summary: findings.length === 0 ? 'No policy violations found.' : `Found ${findings.length} issue(s).`,
    findings,
    passed: findings.length === 0,
  }
}

function requireModel(provider: 'openai' | 'anthropic', modelId: string): Model<Api> {
  const model = getModel(provider, modelId as never)
  if (!model) {
    throw new Error(`Unknown model "${modelId}" for provider "${provider}"`)
  }
  return model
}

export function createModel(runtime: RuntimeConfig): ModelHandle {
  if (runtime.provider === 'mock') {
    const responseFactory: FauxResponseFactory = (context) =>
      fauxAssistantMessage(`\`\`\`json\n${JSON.stringify(evaluateMockText(extractTargetText(context)))}\n\`\`\``)
    const registration = registerFauxProvider()
    registration.setResponses(Array.from({ length: runtime.max_iterations }, () => responseFactory))
    return {
      model: registration.getModel(),
      cleanup: () => registration.unregister(),
    }
  }

  if (runtime.provider === 'openai' || runtime.provider === 'anthropic') {
    return {
      model: requireModel(runtime.provider, runtime.model),
      cleanup: () => {},
    }
  }

  throw new Error(`Unsupported provider "${runtime.provider}"`)
}
