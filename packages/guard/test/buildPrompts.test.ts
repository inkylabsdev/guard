import { describe, it, expect } from 'vitest'
import { buildSystemPrompt, buildTargetContent, buildUserPrompt } from '../src/agent/buildPrompts.js'
import type { GuardTarget } from '../src/types.js'

describe('buildSystemPrompt', () => {
  it('returns a non-empty string', () => {
    expect(buildSystemPrompt()).toBeTruthy()
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

describe('buildUserPrompt', () => {
  it('returns first-iteration prompt for iteration 1', () => {
    expect(buildUserPrompt(1)).toContain('evaluate the content')
  })

  it('returns follow-up prompt for iteration > 1', () => {
    expect(buildUserPrompt(2)).toContain('Review your previous evaluation')
    expect(buildUserPrompt(3)).toContain('Review your previous evaluation')
  })
})
