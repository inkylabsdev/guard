import type { GuardFinding, GuardTarget } from '../types.js'

export const SCORE_THRESHOLD = 80

export function hasInput(target: GuardTarget): boolean {
  if (target.mode === 'stdin') return target.raw !== undefined
  if (target.mode === 'diff') return target.files.length > 0 || target.raw !== undefined
  return target.files.length > 0
}

export type FilteredFindings = {
  retained: GuardFinding[]
  filtered: number
}

function findingKey(finding: GuardFinding): string {
  return [
    finding.rule ?? '',
    finding.file ?? '',
    finding.line ?? '',
    finding.message,
  ].join('\0')
}

export function filterAndDedupeFindings(findings: GuardFinding[]): FilteredFindings {
  const retainedByKey = new Map<string, GuardFinding>()
  let filtered = 0

  for (const finding of findings) {
    if (finding.score < SCORE_THRESHOLD) {
      filtered++
      continue
    }

    const key = findingKey(finding)
    const existing = retainedByKey.get(key)
    if (!existing || finding.score > existing.score) {
      retainedByKey.set(key, finding)
    }
  }

  return {
    retained: [...retainedByKey.values()],
    filtered,
  }
}

export function sortFindings(findings: GuardFinding[]): GuardFinding[] {
  return [...findings].sort((a, b) =>
    (a.file ?? '').localeCompare(b.file ?? '') ||
    (a.line ?? 0) - (b.line ?? 0) ||
    b.score - a.score ||
    a.message.localeCompare(b.message))
}
