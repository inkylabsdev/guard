import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { resolveLinkedFiles } from '../src/config/resolveLinkedFiles.js'

describe('resolveLinkedFiles', () => {
  let dir: string

  beforeEach(() => {
    dir = join(tmpdir(), `guard-linked-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns empty string when no @references exist', () => {
    expect(resolveLinkedFiles('# Policy\n- Do good.', dir)).toBe('')
  })

  it('inlines content of a referenced file', () => {
    writeFileSync(join(dir, 'SECURITY.md'), '# Security Rules')
    const result = resolveLinkedFiles('See @SECURITY.md for rules.', dir)
    expect(result).toContain('# Security Rules')
    expect(result).toContain('linked: SECURITY.md')
  })

  it('warns and continues when referenced file is missing', () => {
    const stderrWrites: string[] = []
    const original = process.stderr.write.bind(process.stderr)
    process.stderr.write = (s: string) => { stderrWrites.push(s); return true }
    try {
      const result = resolveLinkedFiles('See @MISSING.md for rules.', dir)
      expect(result).toBe('')
      expect(stderrWrites.some((s) => s.includes('MISSING.md'))).toBe(true)
    } finally {
      process.stderr.write = original
    }
  })

  it('avoids infinite recursion from circular references', () => {
    writeFileSync(join(dir, 'A.md'), 'See @B.md')
    writeFileSync(join(dir, 'B.md'), 'See @A.md')
    const visited = new Set<string>()
    visited.add(join(dir, 'A.md'))
    const result = resolveLinkedFiles('See @A.md', dir, visited)
    expect(result).toBe('')
  })

  it('deduplicates the same file referenced multiple times', () => {
    writeFileSync(join(dir, 'STYLE.md'), '# Style')
    const result = resolveLinkedFiles('See @STYLE.md and also @STYLE.md.', dir)
    const count = (result.match(/linked: STYLE\.md/g) ?? []).length
    expect(count).toBe(1)
  })
})
