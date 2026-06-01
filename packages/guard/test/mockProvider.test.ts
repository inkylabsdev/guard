import { describe, it, expect } from 'vitest'
import { MockProvider } from '../src/providers/MockProvider.js'

const provider = new MockProvider()
const baseInput = {
  systemPrompt: '',
  userPrompt: '',
  policyMarkdown: '',
  iteration: 1,
}

describe('MockProvider', () => {
  it('passes clean input', async () => {
    const result = await provider.evaluate({ ...baseInput, targetContent: 'const x = 1' })
    expect(result.passed).toBe(true)
    expect(result.findings).toHaveLength(0)
  })

  it('flags TODO_SECRET', async () => {
    const result = await provider.evaluate({ ...baseInput, targetContent: 'const key = TODO_SECRET' })
    expect(result.passed).toBe(false)
    expect(result.findings.some((f) => f.rule === 'secret-leak')).toBe(true)
    expect(result.findings[0].severity).toBe('error')
  })

  it('flags console.log(secret', async () => {
    const result = await provider.evaluate({ ...baseInput, targetContent: 'console.log(secret)' })
    expect(result.passed).toBe(false)
    expect(result.findings.some((f) => f.rule === 'secret-leak')).toBe(true)
  })

  it('flags empty catch block', async () => {
    const result = await provider.evaluate({ ...baseInput, targetContent: 'try { x() } catch (e) {}' })
    expect(result.passed).toBe(false)
    expect(result.findings.some((f) => f.rule === 'empty-catch')).toBe(true)
    expect(result.findings[0].severity).toBe('warning')
  })
})
