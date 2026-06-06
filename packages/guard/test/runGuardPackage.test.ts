import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { fauxAssistantMessage, registerFauxProvider, type FauxProviderRegistration } from '@earendil-works/pi-ai'
import { runGuardPackage } from '../src/agent/runGuardPackage.js'
import type { GuardEvalResult, GuardPackage, GuardRule } from '../src/types.js'

let registration: FauxProviderRegistration | undefined

function jsonResponse(result: GuardEvalResult) {
  return fauxAssistantMessage(`\`\`\`json\n${JSON.stringify(result)}\n\`\`\``)
}

function summaryResponse(files = ['sample.md']) {
  return fauxAssistantMessage(`\`\`\`json\n${JSON.stringify({
    changed_files: files,
    affected_areas: ['tests'],
    behavior_changes: 'Changes sample content.',
  })}\n\`\`\``)
}

function rule(root: string, id: string, depends_on: string[] = [], body = '## Rule'): GuardRule {
  const ruleDir = join(root, id)
  return {
    id,
    severity: 'warning',
    description: id,
    depends_on,
    body,
    ruleDir,
    guardPath: join(ruleDir, 'GUARD.md'),
  }
}

function pkg(root: string, id: string, rules: GuardRule[], dependsOn: string[] = []): GuardPackage {
  return {
    id,
    rootDir: root,
    manifestPath: join(root, 'package.json'),
    guardPath: join(root, 'GUARD.md'),
    guardContent: `# ${id}`,
    dependsOn,
    rules,
  }
}

const target = { mode: 'files' as const, files: [{ path: 'sample.md', content: 'needle' }] }

describe('runGuardPackage', () => {
  let dir: string

  beforeEach(() => {
    dir = join(tmpdir(), `guard-run-package-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
    registration = registerFauxProvider()
  })

  afterEach(() => {
    registration?.unregister()
    registration = undefined
    rmSync(dir, { recursive: true, force: true })
  })

  it('runs ready rules and fills missing rule ids and severity', async () => {
    registration!.setResponses([
      summaryResponse(),
      jsonResponse({
        summary: 'bad',
        passed: false,
        findings: [{ severity: 'error', score: 90, message: 'Found a phrase.' }],
      }),
      jsonResponse({ summary: 'ok', passed: true, findings: [] }),
    ])
    const guardPackage = pkg(dir, 'pkg', [rule(dir, 'a'), rule(dir, 'b')])

    const result = await runGuardPackage(guardPackage, target, 2, registration!.getModel())

    expect(result.ruleResults.map((item) => item.status)).toEqual(['fail', 'pass'])
    expect(result.findings).toEqual([{ severity: 'warning', score: 90, message: 'Found a phrase.', rule: 'a' }])
    expect(registration!.state.callCount).toBe(3)
  })

  it('filters findings below the confidence threshold', async () => {
    registration!.setResponses([
      summaryResponse(),
      jsonResponse({
        summary: 'low confidence',
        passed: false,
        findings: [{ severity: 'warning', score: 79, rule: 'a', message: 'maybe bad' }],
      }),
    ])
    const result = await runGuardPackage(pkg(dir, 'pkg', [rule(dir, 'a')]), target, 2, registration!.getModel())

    expect(result.ruleResults[0]).toMatchObject({
      status: 'pass',
      findings: [],
      filtered_findings: 1,
      summary: 'Only low-confidence findings were filtered.',
    })
    expect(result.passed).toBe(true)
  })

  it('keeps findings at the confidence threshold', async () => {
    registration!.setResponses([
      summaryResponse(),
      jsonResponse({
        summary: 'bad',
        passed: false,
        findings: [{ severity: 'warning', score: 80, rule: 'a', message: 'bad' }],
      }),
    ])
    const result = await runGuardPackage(pkg(dir, 'pkg', [rule(dir, 'a')]), target, 2, registration!.getModel())

    expect(result.ruleResults[0].status).toBe('fail')
    expect(result.findings).toHaveLength(1)
  })

  it('aborts dependent rules when a prerequisite fails', async () => {
    registration!.setResponses([
      summaryResponse(),
      jsonResponse({
        summary: 'bad',
        passed: false,
        findings: [{ severity: 'warning', score: 90, rule: 'a', message: 'bad' }],
      }),
    ])
    const guardPackage = pkg(dir, 'pkg', [rule(dir, 'a'), rule(dir, 'b', ['a'])])

    const result = await runGuardPackage(guardPackage, target, 2, registration!.getModel())

    expect(result.ruleResults.map((item) => item.status)).toEqual(['fail', 'abort'])
    expect(registration!.state.callCount).toBe(2)
  })

  it('adds helper script stdout and target summary to the rule prompt', async () => {
    const ruleDir = join(dir, 'script-rule')
    mkdirSync(join(ruleDir, 'scripts'), { recursive: true })
    const script = join(ruleDir, 'scripts', 'scan.sh')
    writeFileSync(script, '#!/bin/sh\ncat\n')
    chmodSync(script, 0o755)

    const prompts: string[] = []
    registration!.setResponses([
      summaryResponse(),
      (context) => {
        prompts.push(String(context.messages[0].content))
        return jsonResponse({ summary: 'ok', passed: true, findings: [] })
      },
    ])
    const guardPackage = pkg(dir, 'pkg', [rule(dir, 'script-rule', [], '## Check\n\n1. Run `scripts/scan.sh`')])

    const result = await runGuardPackage(guardPackage, target, 2, registration!.getModel())

    expect(result.ruleResults[0].status).toBe('pass')
    expect(prompts[0]).toContain('=== Target Summary ===')
    expect(prompts[0]).toContain('=== Helper Script: scripts/scan.sh ===\n=== File: sample.md ===')
  })

  it('continues without a summary when summarization fails', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    registration!.setResponses([
      fauxAssistantMessage('not json'),
      jsonResponse({ summary: 'ok', passed: true, findings: [] }),
    ])

    const result = await runGuardPackage(pkg(dir, 'pkg', [rule(dir, 'a')]), target, 2, registration!.getModel())

    expect(result.ruleResults[0].status).toBe('pass')
    expect(String(stderr.mock.calls[0][0])).toContain('warning: target summarization failed')
    stderr.mockRestore()
  })

  it('returns an error result when a checker response is invalid', async () => {
    registration!.setResponses([
      summaryResponse(),
      jsonResponse({
        summary: 'bad',
        passed: false,
        findings: [{ severity: 'warning', message: 'missing score' } as never],
      }),
    ])

    const result = await runGuardPackage(pkg(dir, 'pkg', [rule(dir, 'a')]), target, 2, registration!.getModel())

    expect(result.ruleResults[0].status).toBe('error')
    expect(result.ruleResults[0].summary).toContain('Parse error')
  })

  it('returns an error result when a helper script fails', async () => {
    const ruleDir = join(dir, 'script-rule')
    mkdirSync(join(ruleDir, 'scripts'), { recursive: true })
    const script = join(ruleDir, 'scripts', 'fail.sh')
    writeFileSync(script, '#!/bin/sh\nexit 7\n')
    chmodSync(script, 0o755)
    registration!.setResponses([summaryResponse()])
    const guardPackage = pkg(dir, 'pkg', [rule(dir, 'script-rule', [], '## Check\n\n1. Run `scripts/fail.sh`')])

    const result = await runGuardPackage(guardPackage, target, 2, registration!.getModel())

    expect(result.ruleResults[0].status).toBe('error')
    expect(result.ruleResults[0].summary).toContain('helper script failed')
    expect(registration!.state.callCount).toBe(1)
  })

  it('returns an error result when a script reference escapes the rule directory', async () => {
    registration!.setResponses([summaryResponse()])
    const guardPackage = pkg(dir, 'pkg', [rule(dir, 'script-rule', [], '## Check\n\n1. Run `scripts/../../outside.sh`')])

    const result = await runGuardPackage(guardPackage, target, 2, registration!.getModel())

    expect(result.ruleResults[0].status).toBe('error')
    expect(result.ruleResults[0].summary).toContain('script escapes rule directory')
  })

  it('skips empty input without model calls', async () => {
    const result = await runGuardPackage(pkg(dir, 'pkg', [rule(dir, 'a')]), { mode: 'files', files: [] }, 2, registration!.getModel())

    expect(result.summary).toBe('No input to check.')
    expect(result.ruleResults[0].status).toBe('pass')
    expect(registration!.state.callCount).toBe(0)
  })

  it('aborts dependent packages when a package dependency fails', async () => {
    registration!.setResponses([
      summaryResponse(),
      jsonResponse({
        summary: 'bad',
        passed: false,
        findings: [{ severity: 'warning', score: 90, rule: 'a', message: 'bad' }],
      }),
    ])
    const base = pkg(join(dir, 'base'), 'base', [rule(join(dir, 'base'), 'a')])
    const child = pkg(join(dir, 'child'), 'child', [rule(join(dir, 'child'), 'b')], ['base'])

    const result = await runGuardPackage([base, child], target, 2, registration!.getModel())

    expect(result.ruleResults.map((item) => item.status)).toEqual(['fail', 'abort'])
    expect(registration!.state.callCount).toBe(2)
  })

  it('includes dependent package GUARD.md as context', async () => {
    const prompts: string[] = []
    registration!.setResponses([
      summaryResponse(),
      jsonResponse({ summary: 'base ok', passed: true, findings: [] }),
      (context) => {
        prompts.push(String(context.messages[0].content))
        return jsonResponse({ summary: 'child ok', passed: true, findings: [] })
      },
    ])
    const base = pkg(join(dir, 'base'), 'base', [rule(join(dir, 'base'), 'a')])
    const child = pkg(join(dir, 'child'), 'child', [rule(join(dir, 'child'), 'b')], ['base'])

    await runGuardPackage([base, child], target, 2, registration!.getModel())

    expect(prompts[0]).toContain('=== Dependency Package GUARD.md: base ===')
    expect(prompts[0]).toContain('# base')
  })

  it('deduplicates findings and keeps fields from the highest-scoring duplicate', async () => {
    registration!.setResponses([
      summaryResponse(),
      jsonResponse({
        summary: 'bad',
        passed: false,
        findings: [
          { severity: 'warning', score: 82, rule: 'a', file: 'b.ts', line: 2, message: 'same', suggestion: 'low' },
          { severity: 'warning', score: 95, rule: 'a', file: 'b.ts', line: 2, message: 'same', suggestion: 'high' },
        ],
      }),
    ])

    const result = await runGuardPackage(pkg(dir, 'pkg', [rule(dir, 'a')]), target, 2, registration!.getModel())

    expect(result.findings).toEqual([
      { severity: 'warning', score: 95, rule: 'a', file: 'b.ts', line: 2, message: 'same', suggestion: 'high' },
    ])
  })

  it('sorts findings by file, line, then score descending', async () => {
    registration!.setResponses([
      summaryResponse(),
      jsonResponse({
        summary: 'bad',
        passed: false,
        findings: [
          { severity: 'warning', score: 82, rule: 'a', file: 'b.ts', line: 2, message: 'second' },
          { severity: 'warning', score: 90, rule: 'a', file: 'a.ts', line: 2, message: 'first' },
          { severity: 'warning', score: 95, rule: 'a', file: 'b.ts', line: 2, message: 'higher' },
        ],
      }),
    ])

    const result = await runGuardPackage(pkg(dir, 'pkg', [rule(dir, 'a')]), target, 2, registration!.getModel())

    expect(result.findings.map((finding) => finding.message)).toEqual(['first', 'higher', 'second'])
  })

  it('rejects missing package dependencies and cycles', async () => {
    const base = pkg(join(dir, 'base'), 'base', [rule(join(dir, 'base'), 'a')], ['missing'])
    await expect(runGuardPackage([base], target, 2, registration!.getModel())).rejects.toThrow('missing package')

    const a = pkg(join(dir, 'a'), 'a', [rule(join(dir, 'a'), 'ra')], ['b'])
    const b = pkg(join(dir, 'b'), 'b', [rule(join(dir, 'b'), 'rb')], ['a'])
    await expect(runGuardPackage([a, b], target, 2, registration!.getModel())).rejects.toThrow('cycle detected')
  })
})
