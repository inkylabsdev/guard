import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { findGuardFile } from '../src/config/findGuardFile.js'

describe('findGuardFile', () => {
  let root: string

  beforeEach(() => {
    root = join(tmpdir(), `guard-find-${Date.now()}`)
    mkdirSync(root, { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('finds GUARD.md in the start directory', () => {
    writeFileSync(join(root, 'GUARD.md'), '# Policy')
    expect(findGuardFile(root)).toBe(join(root, 'GUARD.md'))
  })

  it('finds GUARD.md in a parent directory', () => {
    writeFileSync(join(root, 'GUARD.md'), '# Policy')
    const sub = join(root, 'src', 'lib')
    mkdirSync(sub, { recursive: true })
    expect(findGuardFile(sub)).toBe(join(root, 'GUARD.md'))
  })

  it('returns null when no GUARD.md exists', () => {
    expect(findGuardFile(root)).toBeNull()
  })

  it('stops at filesystem root without infinite loop', () => {
    expect(findGuardFile('/')).toBeNull()
  })
})
