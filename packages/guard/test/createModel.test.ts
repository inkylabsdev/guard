import { completeSimple, fauxAssistantMessage } from '@earendil-works/pi-ai'
import { describe, expect, it } from 'vitest'
import { createModel } from '../src/providers/createModel.js'
import { runGuardAgent } from '../src/agent/runGuardAgent.js'
import type { GuardConfig, RuntimeConfig, ResolvedGuardPolicy } from '../src/types.js'

const mockRuntime: RuntimeConfig = {
  model: 'faux',
  provider: 'faux',
  concurrency: 4,
}

const mockGuardConfig: GuardConfig = {
  severity_threshold: 'info',
  include: [],
  dependencies: [],
}

const policy: ResolvedGuardPolicy = {
  policyPath: '/fake/GUARD.md',
  content: '# Policy',
  config: mockGuardConfig,
}

describe('createModel', () => {
  it('returns a faux model that passes clean text and can be cleaned up', async () => {
    const handle = createModel(mockRuntime)
    try {
      const result = await runGuardAgent(policy, { mode: 'stdin', files: [], raw: 'const x = 1' }, handle.model)
      expect(result).toEqual({ summary: 'No policy violations found.', findings: [], passed: true })
    } finally {
      handle.cleanup()
    }
  })

  it('extracts text blocks from structured context messages and unregisters on cleanup', async () => {
    const handle = createModel(mockRuntime)
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

  it('uses the faux keyword checks', async () => {
    const handle = createModel(mockRuntime)
    try {
      const result = await runGuardAgent(policy, {
        mode: 'stdin',
        files: [],
        raw: 'const key = TODO_SECRET\nconsole.log(secret)\ntry { x() } catch (e) {}',
      }, handle.model)
      expect(result.summary).toBe('Found 3 issue(s).')
      expect(result.findings.map((finding) => finding.rule)).toEqual(['secret-leak', 'secret-leak', 'empty-catch'])
      expect(result.findings.map((finding) => finding.score)).toEqual([100, 100, 90])
      expect(result.passed).toBe(false)
    } finally {
      handle.cleanup()
    }
  })

  it('summarizes empty target content in faux mode', async () => {
    const handle = createModel(mockRuntime)
    try {
      const result = await completeSimple(handle.model, {
        messages: [{ role: 'user', content: 'Summarize the target content\n\n=== Content ===\n', timestamp: 1 }],
      })
      expect(result.content[0]).toMatchObject({ type: 'text', text: expect.stringContaining('No target content was provided.') })
    } finally {
      handle.cleanup()
    }
  })

  it('does not treat policy examples as target violations', async () => {
    const handle = createModel(mockRuntime)
    try {
      const result = await runGuardAgent({
        ...policy,
        content: '# Policy\nDo not leave TODO_SECRET markers in committed code.',
      }, { mode: 'stdin', files: [], raw: 'const x = 1' }, handle.model)
      expect(result.passed).toBe(true)
    } finally {
      handle.cleanup()
    }
  })

  it('returns a known OpenAI model', () => {
    const handle = createModel({ ...mockRuntime, provider: 'openai', model: 'gpt-4o' })
    expect(handle.model.id).toBe('gpt-4o')
    handle.cleanup()
  })

  it('returns a known Anthropic model', () => {
    const handle = createModel({ ...mockRuntime, provider: 'anthropic', model: 'claude-haiku-4-5' })
    expect(handle.model.id).toBe('claude-haiku-4-5')
    handle.cleanup()
  })

  it('returns a known pi-ai provider model', () => {
    const handle = createModel({ ...mockRuntime, provider: 'mistral', model: 'codestral-latest' })
    expect(handle.model.id).toBe('codestral-latest')
    expect(handle.model.provider).toBe('mistral')
    handle.cleanup()
  })

  it('throws for an unknown model', () => {
    expect(() => createModel({ ...mockRuntime, provider: 'openai', model: 'missing' })).toThrow('Unknown model')
  })

  it('throws for an unsupported provider', () => {
    expect(() => createModel({ ...mockRuntime, provider: 'other' as never })).toThrow('Unsupported provider')
  })
})
