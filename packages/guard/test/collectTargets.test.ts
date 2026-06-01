import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { Readable } from 'stream'
import { collectTargets } from '../src/input/collectTargets.js'
import { collectStdin } from '../src/input/collectStdin.js'

describe('collectTargets', () => {
  let dir: string

  beforeEach(() => {
    dir = join(tmpdir(), `guard-targets-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('collects a single file', async () => {
    const file = join(dir, 'foo.ts')
    writeFileSync(file, 'const x = 1')
    const target = await collectTargets({ args: [file], cwd: dir })
    expect(target.mode).toBe('files')
    expect(target.files).toHaveLength(1)
    expect(target.files[0].path).toBe(file)
    expect(target.files[0].content).toBe('const x = 1')
  })

  it('collects files from a directory', async () => {
    writeFileSync(join(dir, 'a.ts'), 'a')
    writeFileSync(join(dir, 'b.ts'), 'b')
    const target = await collectTargets({ args: [dir], cwd: dir })
    expect(target.files.length).toBeGreaterThanOrEqual(2)
  })

  it('expands @ file list', async () => {
    const src = join(dir, 'src.ts')
    writeFileSync(src, 'hello')
    const listFile = join(dir, 'list.txt')
    writeFileSync(listFile, `# comment\n${src}\n`)
    const target = await collectTargets({ args: [`@${listFile}`], cwd: dir })
    expect(target.files.some((f) => f.path === src)).toBe(true)
  })

  it('skips blank lines and comments in @ file list', async () => {
    const src = join(dir, 'src.ts')
    writeFileSync(src, 'hello')
    const listFile = join(dir, 'list.txt')
    writeFileSync(listFile, `\n# ignored\n${src}\n\n`)
    const target = await collectTargets({ args: [`@${listFile}`], cwd: dir })
    expect(target.files).toHaveLength(1)
  })
})

describe('collectStdin', () => {
  it('reads all bytes from a stream', async () => {
    const stream = Readable.from(['hello ', 'world'])
    const target = await collectStdin(stream)
    expect(target.mode).toBe('stdin')
    expect(target.raw).toBe('hello world')
    expect(target.files).toHaveLength(0)
  })

  it('handles empty stream', async () => {
    const stream = Readable.from([])
    const target = await collectStdin(stream)
    expect(target.raw).toBe('')
  })
})
