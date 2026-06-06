import { describe, expect, it } from 'vitest'
import { filterAndDedupeFindings, hasInput, sortFindings } from '../src/agent/findings.js'

describe('hasInput', () => {
  it('checks stdin by raw presence', () => {
    expect(hasInput({ mode: 'stdin', files: [], raw: '' })).toBe(true)
    expect(hasInput({ mode: 'stdin', files: [] })).toBe(false)
  })

  it('checks diff by files or raw presence', () => {
    expect(hasInput({ mode: 'diff', files: [] })).toBe(false)
    expect(hasInput({ mode: 'diff', files: [], raw: '' })).toBe(true)
    expect(hasInput({ mode: 'diff', files: [{ path: 'a.ts', content: '' }] })).toBe(true)
  })

  it('checks file input by collected files', () => {
    expect(hasInput({ mode: 'files', files: [] })).toBe(false)
    expect(hasInput({ mode: 'files', files: [{ path: 'a.ts', content: '' }] })).toBe(true)
  })
})

describe('filterAndDedupeFindings', () => {
  it('supports missing optional key fields', () => {
    const result = filterAndDedupeFindings([
      { severity: 'warning', score: 90, message: 'same' },
      { severity: 'warning', score: 95, message: 'same', suggestion: 'higher' },
    ])

    expect(result).toEqual({
      filtered: 0,
      retained: [{ severity: 'warning', score: 95, message: 'same', suggestion: 'higher' }],
    })
  })
})

describe('sortFindings', () => {
  it('falls back across file, line, score, and message sort keys', () => {
    const sorted = sortFindings([
      { severity: 'warning', score: 90, file: 'b.ts', line: 1, message: 'b-file' },
      { severity: 'warning', score: 80, file: 'a.ts', line: 2, message: 'line-two' },
      { severity: 'warning', score: 80, file: 'a.ts', line: 1, message: 'lower-score' },
      { severity: 'warning', score: 95, file: 'a.ts', line: 1, message: 'higher-score' },
      { severity: 'warning', score: 95, file: 'a.ts', line: 1, message: 'a-message' },
    ])

    expect(sorted.map((finding) => finding.message)).toEqual([
      'a-message',
      'higher-score',
      'lower-score',
      'line-two',
      'b-file',
    ])
  })

  it('sorts findings with missing file and line fields', () => {
    const sorted = sortFindings([
      { severity: 'warning', score: 80, message: 'no-file-low' },
      { severity: 'warning', score: 90, message: 'no-file-high' },
      { severity: 'warning', score: 95, file: 'a.ts', message: 'with-file' },
    ])

    expect(sorted.map((finding) => finding.message)).toEqual([
      'no-file-high',
      'no-file-low',
      'with-file',
    ])
  })
})
