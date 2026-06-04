import { describe, it, expect } from 'vitest'
import { buildFollowUpPrompt, buildInitialUserMessage, buildSystemPrompt, buildTargetContent } from '../src/agent/buildPrompts.js'
import type { GuardTarget, ResolvedGuardPolicy } from '../src/types.js'

const policy: ResolvedGuardPolicy = {
  policyPath: '/repo/GUARD.md',
  content: '# Policy',
  config: {
    severity_threshold: 'info',
    include: [],
  },
}

describe('buildSystemPrompt', () => {
  it('returns a non-empty string', () => {
    expect(buildSystemPrompt()).toBeTruthy()
    expect(buildSystemPrompt()).toContain('```json ... ```')
  })
})

describe('buildTargetContent', () => {
  it('includes raw input when present', () => {
    const target: GuardTarget = { mode: 'stdin', files: [], raw: 'some log output' }
    const content = buildTargetContent(target)
    expect(content).toContain('=== Raw Input ===')
    expect(content).toContain('some log output')
  })

  it('includes file sections', () => {
    const target: GuardTarget = {
      mode: 'files',
      files: [{ path: '/repo/foo.ts', content: 'const x = 1' }],
    }
    const content = buildTargetContent(target)
    expect(content).toContain('=== File: /repo/foo.ts ===')
    expect(content).toContain('const x = 1')
  })

  it('includes both raw input and files', () => {
    const target: GuardTarget = {
      mode: 'diff',
      files: [{ path: 'a.ts', content: 'code' }],
      raw: 'diff content',
    }
    const content = buildTargetContent(target)
    expect(content).toContain('=== Raw Input ===')
    expect(content).toContain('=== File: a.ts ===')
  })

  it('returns empty string when no raw and no files', () => {
    const target: GuardTarget = { mode: 'files', files: [] }
    expect(buildTargetContent(target)).toBe('')
  })
})

describe('buildInitialUserMessage', () => {
  it('returns a pi-ai user message with policy and target content', () => {
    const message = buildInitialUserMessage(policy, {
      mode: 'files',
      files: [{ path: 'a.ts', content: 'const x = 1' }],
    })
    expect(message.role).toBe('user')
    expect(message.content).toContain('evaluate the content')
    expect(message.content).toContain('# Policy')
    expect(message.content).toContain('const x = 1')
    expect(message.timestamp).toEqual(expect.any(Number))
  })
})

describe('buildFollowUpPrompt', () => {
  it('asks for additional violations', () => {
    expect(buildFollowUpPrompt()).toContain('Review your previous evaluation')
  })
})
