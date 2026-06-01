import type { LLMProvider } from './LLMProvider.js'
import type { LLMEvaluateInput, LLMEvaluateResult, GuardFinding } from '../types.js'

export class MockProvider implements LLMProvider {
  name = 'mock'

  async evaluate(input: LLMEvaluateInput): Promise<LLMEvaluateResult> {
    const text = input.targetContent
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
}
