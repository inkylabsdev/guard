import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { fauxAssistantMessage, registerFauxProvider, type FauxProviderRegistration } from '@earendil-works/pi-ai'
import { runGuardPackage } from '../src/agent/runGuardPackage.js'
import type { GuardEvalResult, GuardPackage, GuardRule, RuntimeConfig } from '../src/types.js'

const runtime: RuntimeConfig = {
  provider: 'mock',
  model: 'mock',
  max_iterations: 1,
}

let registration: FauxProviderRegistration | undefined

function jsonResponse(result: GuardEvalResult) {
  return fauxAssistantMessage(`\`\`\`json\n${JSON.stringify(result)}\n\`\`\``)
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

  it('runs rules one at a time and fills missing rule ids and severity', async () => {
    registration!.setResponses([
      jsonResponse({
        summary: 'bad',
        passed: false,
        findings: [{ severity: 'error', message: 'Found a phrase.' }],
      }),
      jsonResponse({ summary: 'ok', passed: true, findings: [] }),
    ])
    const pkg: GuardPackage = {
      rootDir: dir,
      manifestPath: join(dir, 'package.json'),
      rules: [rule(dir, 'a'), rule(dir, 'b')],
    }

    const result = await runGuardPackage(pkg, { mode: 'files', files: [] }, runtime, registration!.getModel())

    expect(result.ruleResults.map((item) => item.status)).toEqual(['fail', 'pass'])
    expect(result.findings).toEqual([{ severity: 'warning', message: 'Found a phrase.', rule: 'a' }])
    expect(registration!.state.callCount).toBe(2)
  })

  it('aborts dependent rules when a prerequisite fails', async () => {
    registration!.setResponses([
      jsonResponse({
        summary: 'bad',
        passed: false,
        findings: [{ severity: 'warning', rule: 'a', message: 'bad' }],
      }),
    ])
    const pkg: GuardPackage = {
      rootDir: dir,
      manifestPath: join(dir, 'package.json'),
      rules: [rule(dir, 'a'), rule(dir, 'b', ['a'])],
    }

    const result = await runGuardPackage(pkg, { mode: 'files', files: [] }, runtime, registration!.getModel())

    expect(result.ruleResults.map((item) => item.status)).toEqual(['fail', 'abort'])
    expect(registration!.state.callCount).toBe(1)
  })

  it('adds helper script stdout to the rule prompt and passes target input on stdin', async () => {
    const ruleDir = join(dir, 'script-rule')
    mkdirSync(join(ruleDir, 'scripts'), { recursive: true })
    const script = join(ruleDir, 'scripts', 'scan.sh')
    writeFileSync(script, '#!/bin/sh\ncat\n')
    chmodSync(script, 0o755)

    const prompts: string[] = []
    registration!.setResponses([
      (context) => {
        prompts.push(String(context.messages[0].content))
        return jsonResponse({ summary: 'ok', passed: true, findings: [] })
      },
    ])
    const pkg: GuardPackage = {
      rootDir: dir,
      manifestPath: join(dir, 'package.json'),
      rules: [rule(dir, 'script-rule', [], '## Check\n\n1. Run `scripts/scan.sh`')],
    }

    const result = await runGuardPackage(
      pkg,
      { mode: 'files', files: [{ path: 'sample.md', content: 'needle' }] },
      runtime,
      registration!.getModel(),
    )

    expect(result.ruleResults[0].status).toBe('pass')
    expect(prompts[0]).toContain('=== Helper Script: scripts/scan.sh ===\n=== File: sample.md ===')
  })

  it('returns an error result when a helper script fails', async () => {
    const ruleDir = join(dir, 'script-rule')
    mkdirSync(join(ruleDir, 'scripts'), { recursive: true })
    const script = join(ruleDir, 'scripts', 'fail.sh')
    writeFileSync(script, '#!/bin/sh\nexit 7\n')
    chmodSync(script, 0o755)
    const pkg: GuardPackage = {
      rootDir: dir,
      manifestPath: join(dir, 'package.json'),
      rules: [rule(dir, 'script-rule', [], '## Check\n\n1. Run `scripts/fail.sh`')],
    }

    const result = await runGuardPackage(pkg, { mode: 'files', files: [] }, runtime, registration!.getModel())

    expect(result.ruleResults[0].status).toBe('error')
    expect(result.ruleResults[0].summary).toContain('helper script failed')
    expect(registration!.state.callCount).toBe(0)
  })

  it('returns an error result when a script reference escapes the rule directory', async () => {
    const pkg: GuardPackage = {
      rootDir: dir,
      manifestPath: join(dir, 'package.json'),
      rules: [rule(dir, 'script-rule', [], '## Check\n\n1. Run `scripts/../../outside.sh`')],
    }

    const result = await runGuardPackage(pkg, { mode: 'files', files: [] }, runtime, registration!.getModel())

    expect(result.ruleResults[0].status).toBe('error')
    expect(result.ruleResults[0].summary).toContain('script escapes rule directory')
  })
})
