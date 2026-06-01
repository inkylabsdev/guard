import { describe, it, expect } from 'vitest'
import { computeExitCode } from '../src/report/exitCode.js'
import { formatReport } from '../src/report/formatReport.js'
import type { LLMEvaluateResult, GuardTarget } from '../src/types.js'

describe('computeExitCode', () => {
  const target: GuardTarget = { mode: 'files', files: [] }

  it('returns 0 when no findings', () => {
    expect(computeExitCode([], 'info')).toBe(0)
  })

  it('returns 1 for info finding when threshold is info', () => {
    expect(computeExitCode([{ severity: 'info', message: 'x' }], 'info')).toBe(1)
  })

  it('returns 0 for info finding when threshold is warning', () => {
    expect(computeExitCode([{ severity: 'info', message: 'x' }], 'warning')).toBe(0)
  })

  it('returns 1 for warning when threshold is warning', () => {
    expect(computeExitCode([{ severity: 'warning', message: 'x' }], 'warning')).toBe(1)
  })

  it('returns 0 for warning when threshold is error', () => {
    expect(computeExitCode([{ severity: 'warning', message: 'x' }], 'error')).toBe(0)
  })

  it('returns 1 for error when threshold is error', () => {
    expect(computeExitCode([{ severity: 'error', message: 'x' }], 'error')).toBe(1)
  })
})

describe('formatReport', () => {
  it('shows PASS when no findings', () => {
    const result: LLMEvaluateResult = { summary: 'ok', findings: [], passed: true }
    const target: GuardTarget = { mode: 'files', files: [{ path: 'a.ts', content: '' }] }
    const report = formatReport(result, target, '/repo/GUARD.md')
    expect(report).toContain('PASS')
    expect(report).toContain('1 file')
    expect(report).toContain('No policy violations found')
  })

  it('shows FAIL and findings', () => {
    const result: LLMEvaluateResult = {
      summary: 'found issues',
      findings: [{ severity: 'error', rule: 'secret-leak', message: 'Do not log secrets.', evidence: 'console.log(secret)' }],
      passed: false,
    }
    const target: GuardTarget = { mode: 'files', files: [] }
    const report = formatReport(result, target, '/repo/GUARD.md')
    expect(report).toContain('FAIL')
    expect(report).toContain('ERROR')
    expect(report).toContain('secret-leak')
    expect(report).toContain('Do not log secrets.')
    expect(report).toContain('console.log(secret)')
    expect(report).toContain('1 error')
  })

  it('shows stdin mode', () => {
    const result: LLMEvaluateResult = { summary: 'ok', findings: [], passed: true }
    const target: GuardTarget = { mode: 'stdin', files: [], raw: 'some text' }
    const report = formatReport(result, target, '/repo/GUARD.md')
    expect(report).toContain('stdin')
  })
})
