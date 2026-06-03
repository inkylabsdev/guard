import type { UserMessage } from '@earendil-works/pi-ai'
import type { GuardTarget, ResolvedGuardPolicy } from '../types.js'

export function buildSystemPrompt(): string {
  return [
    'You are Guard, a strict but fair policy checker.',
    'Your job is to evaluate whether the provided content violates any of the listed policies.',
    'Be concise. Only report genuine violations. Do not invent issues.',
    'Respond with a single fenced ```json ... ``` block containing an object with summary, findings, and passed fields.',
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

export function buildInitialUserMessage(policy: ResolvedGuardPolicy, target: GuardTarget): UserMessage {
  return {
    role: 'user',
    content: [
      'Please evaluate the content against the policy and report any violations.',
      `=== Policy ===\n${policy.content}`,
      `=== Content ===\n${buildTargetContent(target)}`,
    ].filter(Boolean).join('\n\n'),
    timestamp: Date.now(),
  }
}

export function buildFollowUpPrompt(): string {
  return 'Review your previous evaluation. Are there any additional violations you may have missed?'
}
