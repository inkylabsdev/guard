import type { GuardTarget } from '../types.js'

export function buildSystemPrompt(): string {
  return [
    'You are Guard, a strict but fair policy checker.',
    'Your job is to evaluate whether the provided content violates any of the listed policies.',
    'Be concise. Only report genuine violations. Do not invent issues.',
  ].join(' ')
}

export function buildTargetContent(target: GuardTarget): string {
  const parts: string[] = []

  if (target.raw) {
    parts.push(`=== Raw Input ===\n${target.raw}`)
  }

  for (const file of target.files) {
    parts.push(`=== File: ${file.path} ===\n${file.content}`)
  }

  return parts.join('\n\n')
}

export function buildUserPrompt(iteration: number): string {
  if (iteration === 1) {
    return 'Please evaluate the content against the policy and report any violations.'
  }
  return 'Review your previous evaluation. Are there any additional violations you may have missed?'
}
