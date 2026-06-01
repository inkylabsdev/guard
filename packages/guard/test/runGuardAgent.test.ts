import { describe, it, expect } from 'vitest'
import { runGuardAgent } from '../src/agent/runGuardAgent.js'
import type { LLMProvider, LLMEvaluateInput, LLMEvaluateResult } from '../src/types.js'
import type { AgentInput, ResolvedGuardPolicy, GuardConfig } from '../src/types.js'

const defaultConfig: GuardConfig = {
  model: 'mock',
  provider: 'mock',
  max_iterations: 3,
  severity_threshold: 'info',
  include: [],
}

const defaultPolicy: ResolvedGuardPolicy = {
  policyPath: '/fake/GUARD.md',
  content: '# Policy',
  config: defaultConfig,
}

function makeInput(overrides: Partial<AgentInput> = {}): AgentInput {
  return {
    policy: defaultPolicy,
    target: { mode: 'files', files: [] },
    config: defaultConfig,
    ...overrides,
  }
}

class StaticProvider implements LLMProvider {
  name = 'static'
  constructor(private results: LLMEvaluateResult[]) {}
  private callCount = 0
  async evaluate(_input: LLMEvaluateInput): Promise<LLMEvaluateResult> {
    return this.results[Math.min(this.callCount++, this.results.length - 1)]
  }
}

describe('runGuardAgent', () => {
  it('returns pass result when provider passes', async () => {
    const provider = new StaticProvider([{ summary: 'ok', findings: [], passed: true }])
    const result = await runGuardAgent(makeInput(), provider)
    expect(result.passed).toBe(true)
    expect(result.findings).toHaveLength(0)
  })

  it('stops iterating after first pass', async () => {
    let callCount = 0
    const provider: LLMProvider = {
      name: 'counting',
      async evaluate() {
        callCount++
        return { summary: 'ok', findings: [], passed: true }
      },
    }
    await runGuardAgent(makeInput(), provider)
    expect(callCount).toBe(1)
  })

  it('runs up to max_iterations when provider keeps failing', async () => {
    let callCount = 0
    const provider: LLMProvider = {
      name: 'always-fail',
      async evaluate() {
        callCount++
        return {
          summary: 'issue',
          findings: [{ severity: 'error', message: 'bad' }],
          passed: false,
        }
      },
    }
    const config = { ...defaultConfig, max_iterations: 2 }
    await runGuardAgent(makeInput({ config }), provider)
    expect(callCount).toBe(2)
  })

  it('deduplicates findings with same rule and message across iterations', async () => {
    const finding = { severity: 'error' as const, rule: 'leak', message: 'secret in logs' }
    const provider = new StaticProvider([
      { summary: 'issue', findings: [finding], passed: false },
      { summary: 'issue', findings: [finding], passed: false },
    ])
    const config = { ...defaultConfig, max_iterations: 2 }
    const result = await runGuardAgent(makeInput({ config }), provider)
    expect(result.findings).toHaveLength(1)
  })

  it('accumulates distinct findings across iterations', async () => {
    const provider = new StaticProvider([
      { summary: 'issue', findings: [{ severity: 'error' as const, rule: 'a', message: 'first' }], passed: false },
      { summary: 'issue', findings: [{ severity: 'warning' as const, rule: 'b', message: 'second' }], passed: false },
    ])
    const config = { ...defaultConfig, max_iterations: 2 }
    const result = await runGuardAgent(makeInput({ config }), provider)
    expect(result.findings).toHaveLength(2)
    expect(result.passed).toBe(false)
  })
})
