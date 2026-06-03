import { completeSimple, fauxAssistantMessage } from '@earendil-works/pi-ai'
import { describe, expect, it } from 'vitest'
import { createModel } from '../src/providers/createModel.js'
import { runGuardAgent } from '../src/agent/runGuardAgent.js'
import type { GuardConfig, ResolvedGuardPolicy } from '../src/types.js'

const mockConfig: GuardConfig = {
  model: 'mock',
  provider: 'mock',
  max_iterations: 1,
  severity_threshold: 'info',
  include: [],
}

const policy: ResolvedGuardPolicy = {
  policyPath: '/fake/GUARD.md',
  content: '# Policy',
  config: mockConfig,
}

describe('createModel', () => {
  it('returns a faux model that passes clean text and can be cleaned up', async () => {
    const handle = createModel(mockConfig)
    try {
      const result = await runGuardAgent(policy, { mode: 'stdin', files: [], raw: 'const x = 1' }, mockConfig, handle.model)
      expect(result).toEqual({ summary: 'No policy violations found.', findings: [], passed: true })
    } finally {
      handle.cleanup()
    }
  })

  it('extracts text blocks from structured context messages and unregisters on cleanup', async () => {
    const handle = createModel(mockConfig)
    const result = await completeSimple(handle.model, {
      messages: [
        { role: 'user', content: 'const x = 1', timestamp: 1 },
        { role: 'user', content: [{ type: 'image', data: 'x', mimeType: 'image/png' }, { type: 'text', text: 'TODO_SECRET' }], timestamp: 1 },
        fauxAssistantMessage([{ type: 'thinking', thinking: 'ignore' }, { type: 'text', text: 'console.log(secret)' }]),
        {
          role: 'toolResult',
          toolCallId: '1',
          toolName: 'test',
          content: [{ type: 'image', data: 'x', mimeType: 'image/png' }, { type: 'text', text: 'catch (e) {}' }],
          isError: false,
          timestamp: 1,
        },
      ],
    })
    expect(result.content[0]).toMatchObject({ type: 'text', text: expect.stringContaining('Found 3 issue(s).') })

    handle.cleanup()
    await expect(completeSimple(handle.model, { messages: [] })).rejects.toThrow('No API provider registered')
  })

  it('uses the former mock keyword checks', async () => {
    const handle = createModel(mockConfig)
    try {
      const result = await runGuardAgent(policy, {
        mode: 'stdin',
        files: [],
        raw: 'const key = TODO_SECRET\nconsole.log(secret)\ntry { x() } catch (e) {}',
      }, mockConfig, handle.model)
      expect(result.summary).toBe('Found 3 issue(s).')
      expect(result.findings.map((finding) => finding.rule)).toEqual(['secret-leak', 'secret-leak', 'empty-catch'])
      expect(result.passed).toBe(false)
    } finally {
      handle.cleanup()
    }
  })

  it('does not treat policy examples as target violations', async () => {
    const handle = createModel(mockConfig)
    try {
      const result = await runGuardAgent({
        ...policy,
        content: '# Policy\nDo not leave TODO_SECRET markers in committed code.',
      }, { mode: 'stdin', files: [], raw: 'const x = 1' }, mockConfig, handle.model)
      expect(result.passed).toBe(true)
    } finally {
      handle.cleanup()
    }
  })

  it('returns a known OpenAI model', () => {
    const handle = createModel({ ...mockConfig, provider: 'openai', model: 'gpt-4o' })
    expect(handle.model.id).toBe('gpt-4o')
    handle.cleanup()
  })

  it('returns a known Anthropic model', () => {
    const handle = createModel({ ...mockConfig, provider: 'anthropic', model: 'claude-haiku-4-5' })
    expect(handle.model.id).toBe('claude-haiku-4-5')
    handle.cleanup()
  })

  it('throws for an unknown model', () => {
    expect(() => createModel({ ...mockConfig, provider: 'openai', model: 'missing' })).toThrow('Unknown model')
  })

  it('throws for an unsupported provider', () => {
    expect(() => createModel({ ...mockConfig, provider: 'other' as never })).toThrow('Unsupported provider')
  })
})
