import type { UserMessage } from '@earendil-works/pi-ai'
import type { GuardTarget, ResolvedGuardPolicy } from '../types.js'

export function buildSystemPrompt(): string {
  return [
    'You are Guard, a strict but fair policy checker.',
    'Your job is to evaluate whether the provided content violates any of the listed policies.',
    'Be concise. Only report genuine violations. Do not invent issues.',
    'Score each finding independently from 0 to 100 for confidence. Use 0 for false positives, 25 for possible issues, 50 for moderate confidence, 75 for highly confident issues, and 100 for certain issues.',
    'Respond with a single fenced ```json ... ``` block containing an object with summary, findings, and passed fields. Every finding must include severity, score, and message.',
  ].join(' ')
}

export function buildTargetContent(target: GuardTarget): string {
  const parts: string[] = []

  if (target.raw !== undefined) {
    parts.push(`=== Raw Input ===\n${target.raw}`)
  }

  for (const file of target.files) {
    parts.push(`=== File: ${file.path} ===\n${file.content}`)
  }

  return parts.join('\n\n')
}

export function buildInitialUserMessage(policy: ResolvedGuardPolicy, target: GuardTarget, targetSummary?: string): UserMessage {
  return {
    role: 'user',
    content: [
      'Please evaluate the content against the policy and report any violations.',
      `=== Policy ===\n${policy.content}`,
      targetSummary ? `=== Target Summary ===\n${targetSummary}` : '',
      `=== Content ===\n${buildTargetContent(target)}`,
    ].filter(Boolean).join('\n\n'),
    timestamp: Date.now(),
  }
}

export function buildSummarizerUserMessage(target: GuardTarget): UserMessage {
  return {
    role: 'user',
    content: [
      'Summarize the target content. Do not evaluate policy compliance and do not produce findings.',
      'Respond with a single fenced ```json ... ``` block containing changed_files, affected_areas, and behavior_changes.',
      `=== Content ===\n${buildTargetContent(target)}`,
    ].join('\n\n'),
    timestamp: Date.now(),
  }
}
