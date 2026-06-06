import { afterEach, describe, expect, it } from 'vitest'
import { fauxAssistantMessage, fauxText, fauxToolCall, registerFauxProvider, type FauxProviderRegistration } from '@earendil-works/pi-ai'
import { runGuardAgent } from '../src/agent/runGuardAgent.js'
import type { GuardConfig, GuardEvalResult, ResolvedGuardPolicy } from '../src/types.js'

const defaultGuardConfig: GuardConfig = {
  severity_threshold: 'info',
  include: [],
  dependencies: [],
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

describe('runGuardAgent', () => {
  it('returns pass result from one checker call', async () => {
    registration = registerFauxProvider()
    registration.setResponses([jsonResponse({ summary: 'ok', findings: [], passed: true })])
    const result = await runGuardAgent(defaultPolicy, { mode: 'files', files: [{ path: 'a.ts', content: 'ok' }] }, registration.getModel())
    expect(result).toEqual({ summary: 'ok', findings: [], passed: true })
    expect(registration.state.callCount).toBe(1)
  })

  it('returns scored findings from one checker call', async () => {
    const finding = { severity: 'error' as const, score: 95, rule: 'leak', message: 'secret in logs' }
    registration = registerFauxProvider()
    registration.setResponses([jsonResponse({ summary: 'issue', findings: [finding], passed: false })])
    const result = await runGuardAgent(defaultPolicy, { mode: 'files', files: [{ path: 'a.ts', content: 'bad' }] }, registration.getModel())
    expect(result).toEqual({ summary: 'issue', findings: [finding], passed: false })
    expect(registration.state.callCount).toBe(1)
  })

  it('injects target summary when provided', async () => {
    registration = registerFauxProvider()
    const prompts: string[] = []
    registration.setResponses([
      (context) => {
        prompts.push(String(context.messages[0].content))
        return jsonResponse({ summary: 'ok', findings: [], passed: true })
      },
    ])
    await runGuardAgent(defaultPolicy, { mode: 'files', files: [{ path: 'a.ts', content: 'ok' }] }, registration.getModel(), 'Changed files: a.ts')
    expect(prompts[0]).toContain('=== Target Summary ===')
    expect(prompts[0]).toContain('Changed files: a.ts')
  })

  it('passes tool results through to the LLM context', async () => {
    registration = registerFauxProvider()
    registration.setResponses([
      fauxAssistantMessage([
        fauxText('```json\n{"summary":"ok","findings":[],"passed":true}\n```'),
        fauxToolCall('missing', {}),
      ]),
    ])
    const result = await runGuardAgent(defaultPolicy, { mode: 'files', files: [{ path: 'a.ts', content: 'ok' }] }, registration.getModel())
    expect(result).toEqual({ summary: 'ok', findings: [], passed: true })
    expect(registration.state.callCount).toBe(1)
  })
})
