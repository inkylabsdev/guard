import { afterEach, describe, expect, it } from 'vitest'
import { fauxAssistantMessage, fauxText, fauxToolCall, registerFauxProvider, type FauxProviderRegistration } from '@earendil-works/pi-ai'
import { runGuardAgent } from '../src/agent/runGuardAgent.js'
import type { GuardConfig, RuntimeConfig, GuardEvalResult, ResolvedGuardPolicy } from '../src/types.js'

const defaultRuntime: RuntimeConfig = {
  provider: 'mock',
  model: 'mock',
  max_iterations: 3,
}

const defaultGuardConfig: GuardConfig = {
  severity_threshold: 'info',
  include: [],
}

const defaultPolicy: ResolvedGuardPolicy = {
  policyPath: '/fake/GUARD.md',
  content: '# Policy',
  config: defaultGuardConfig,
}

let registration: FauxProviderRegistration | undefined

afterEach(() => {
  registration?.unregister()
  registration = undefined
})

function jsonResponse(result: GuardEvalResult) {
  return fauxAssistantMessage(`\`\`\`json\n${JSON.stringify(result)}\n\`\`\``)
}

function registerResponses(results: GuardEvalResult[]) {
  registration = registerFauxProvider()
  registration.setResponses(results.map(jsonResponse))
  return registration
}

describe('runGuardAgent', () => {
  it('returns pass result on the first turn', async () => {
    const faux = registerResponses([{ summary: 'ok', findings: [], passed: true }])
    const result = await runGuardAgent(defaultPolicy, { mode: 'files', files: [] }, defaultRuntime, faux.getModel())
    expect(result).toEqual({ summary: 'ok', findings: [], passed: true })
    expect(faux.state.callCount).toBe(1)
  })

  it('stops early when a later turn passes', async () => {
    const finding = { severity: 'error' as const, rule: 'leak', message: 'secret in logs' }
    const faux = registerResponses([
      { summary: 'issue', findings: [finding], passed: false },
      { summary: 'done', findings: [], passed: true },
    ])
    const result = await runGuardAgent(defaultPolicy, { mode: 'files', files: [] }, defaultRuntime, faux.getModel())
    expect(result).toEqual({ summary: 'done', findings: [finding], passed: false })
    expect(faux.state.callCount).toBe(2)
  })

  it('adds the follow-up prompt only after the first turn', async () => {
    registration = registerFauxProvider()
    const contexts: string[][] = []
    registration.setResponses([
      (context) => {
        contexts.push(context.messages.map((message) => message.role === 'user' ? String(message.content) : message.role))
        return jsonResponse({ summary: 'continue', findings: [], passed: false })
      },
      (context) => {
        contexts.push(context.messages.map((message) => message.role === 'user' ? String(message.content) : message.role))
        return jsonResponse({ summary: 'ok', findings: [], passed: true })
      },
    ])
    await runGuardAgent(defaultPolicy, { mode: 'files', files: [] }, defaultRuntime, registration.getModel())
    expect(contexts[0]).toHaveLength(1)
    expect(contexts[1].at(-1)).toContain('Review your previous evaluation')
  })

  it('runs up to max_iterations when responses keep failing', async () => {
    const config = { ...defaultRuntime, max_iterations: 2 }
    const finding = { severity: 'error' as const, message: 'bad' }
    const faux = registerResponses([
      { summary: 'issue', findings: [finding], passed: false },
      { summary: 'issue', findings: [finding], passed: false },
    ])
    await runGuardAgent(defaultPolicy, { mode: 'files', files: [] }, config, faux.getModel())
    expect(faux.state.callCount).toBe(2)
  })

  it('deduplicates findings with the same rule and message', async () => {
    const config = { ...defaultRuntime, max_iterations: 2 }
    const finding = { severity: 'error' as const, rule: 'leak', message: 'secret in logs' }
    const faux = registerResponses([
      { summary: 'issue', findings: [finding], passed: false },
      { summary: 'issue', findings: [finding], passed: false },
    ])
    const result = await runGuardAgent(defaultPolicy, { mode: 'files', files: [] }, config, faux.getModel())
    expect(result.findings).toEqual([finding])
  })

  it('accumulates distinct findings across turns', async () => {
    const config = { ...defaultRuntime, max_iterations: 2 }
    const first = { severity: 'error' as const, rule: 'a', message: 'first' }
    const second = { severity: 'warning' as const, rule: 'b', message: 'second' }
    const faux = registerResponses([
      { summary: 'issue', findings: [first], passed: false },
      { summary: 'issue', findings: [second], passed: false },
    ])
    const result = await runGuardAgent(defaultPolicy, { mode: 'files', files: [] }, config, faux.getModel())
    expect(result).toEqual({ summary: 'issue', findings: [first, second], passed: false })
  })

  it('passes tool results through to the LLM context', async () => {
    registration = registerFauxProvider()
    registration.setResponses([
      fauxAssistantMessage([
        fauxText('```json\n{"summary":"continue","findings":[],"passed":false}\n```'),
        fauxToolCall('missing', {}),
      ]),
      jsonResponse({ summary: 'ok', findings: [], passed: true }),
    ])
    const result = await runGuardAgent(defaultPolicy, { mode: 'files', files: [] }, defaultRuntime, registration.getModel())
    expect(result).toEqual({ summary: 'ok', findings: [], passed: true })
    expect(registration.state.callCount).toBe(2)
  })
})
