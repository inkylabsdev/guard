import type { GuardFinding, GuardConfig } from '../types.js'

const SEVERITY_RANK: Record<GuardFinding['severity'], number> = { info: 0, warning: 1, error: 2 }

export function computeExitCode(
  findings: GuardFinding[],
  threshold: GuardConfig['severity_threshold'],
): 0 | 1 {
  const thresholdRank = SEVERITY_RANK[threshold]
  const triggered = findings.some((f) => SEVERITY_RANK[f.severity] >= thresholdRank)
  return triggered ? 1 : 0
}
