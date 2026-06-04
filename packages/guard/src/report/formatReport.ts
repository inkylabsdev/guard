import chalk from 'chalk'
import type { GuardEvalResult, GuardFinding, GuardTarget, PackageEvalResult } from '../types.js'

const SEVERITY_COLOR: Record<GuardFinding['severity'], (s: string) => string> = {
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.blue,
}

export function formatReport(
  result: GuardEvalResult,
  target: GuardTarget,
  policyPath: string,
): string {
  const lines: string[] = []
  const fileCount = target.mode === 'stdin' ? 0 : target.files.length

  lines.push(chalk.bold('Guard Report'))
  lines.push('')

  const statusLine = result.passed
    ? chalk.green('Status: PASS')
    : chalk.red('Status: FAIL')
  lines.push(statusLine)

  if (target.mode === 'stdin') {
    lines.push('Checked: stdin')
  } else if (target.mode === 'diff') {
    lines.push(`Checked: ${fileCount} changed file${fileCount !== 1 ? 's' : ''} (diff)`)
  } else {
    lines.push(`Checked: ${fileCount} file${fileCount !== 1 ? 's' : ''}`)
  }

  lines.push(`Policy: ${policyPath}`)

  if (result.passed) {
    lines.push('')
    lines.push(chalk.green('No policy violations found.'))
    return lines.join('\n')
  }

  lines.push('')
  lines.push(chalk.bold('Findings'))

  for (const f of result.findings) {
    lines.push('')
    const color = SEVERITY_COLOR[f.severity]
    const location = [f.file, f.line].filter(Boolean).join(':')
    const parts = [color(f.severity.toUpperCase()), f.rule, location].filter(Boolean)
    lines.push(parts.join(' '))
    lines.push(f.message)
    if (f.evidence) {
      lines.push('')
      lines.push('Evidence:')
      lines.push(f.evidence)
    }
    if (f.suggestion) {
      lines.push('')
      lines.push('Suggestion:')
      lines.push(f.suggestion)
    }
  }

  lines.push('')
  lines.push(chalk.bold('Summary'))
  lines.push('')

  const counts = { error: 0, warning: 0, info: 0 }
  for (const f of result.findings) counts[f.severity]++
  lines.push(`${counts.error} error${counts.error !== 1 ? 's' : ''}, ${counts.warning} warning${counts.warning !== 1 ? 's' : ''}, ${counts.info} info`)

  return lines.join('\n')
}

export function formatPackageReport(
  result: PackageEvalResult,
  target: GuardTarget,
  packagePath: string,
): string {
  const lines = formatReport(result, target, packagePath).split('\n')
  const notable = result.ruleResults.filter((ruleResult) =>
    ruleResult.status === 'error' || ruleResult.status === 'abort')

  if (notable.length === 0) return lines.join('\n')

  lines.push('')
  lines.push(chalk.bold('Rule Results'))

  for (const ruleResult of notable) {
    lines.push('')
    lines.push(`${ruleResult.status.toUpperCase()} ${ruleResult.rule_id}`)
    lines.push(ruleResult.summary)
  }

  return lines.join('\n')
}
