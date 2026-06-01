import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { execa } from 'execa'
import { collectDiff } from '../src/input/collectDiff.js'

async function initGitRepo(dir: string) {
  await execa('git', ['init'], { cwd: dir })
  await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: dir })
  await execa('git', ['config', 'user.name', 'Test'], { cwd: dir })
}

describe('collectDiff', () => {
  let dir: string

  beforeEach(() => {
    dir = join(tmpdir(), `guard-diff-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns empty diff outside a git repo', async () => {
    const target = await collectDiff(dir)
    expect(target.mode).toBe('diff')
    expect(target.files).toHaveLength(0)
    expect(target.raw).toBe('')
  })

  it('returns empty diff in a git repo with no changes', async () => {
    await initGitRepo(dir)
    writeFileSync(join(dir, 'a.ts'), 'const x = 1')
    await execa('git', ['add', '.'], { cwd: dir })
    await execa('git', ['commit', '-m', 'init'], { cwd: dir })
    const target = await collectDiff(dir)
    expect(target.files).toHaveLength(0)
    expect(target.raw).toBe('')
  })

  it('includes unstaged changed files and diff content', async () => {
    await initGitRepo(dir)
    writeFileSync(join(dir, 'a.ts'), 'const x = 1')
    await execa('git', ['add', '.'], { cwd: dir })
    await execa('git', ['commit', '-m', 'init'], { cwd: dir })
    writeFileSync(join(dir, 'a.ts'), 'const x = 2')
    const target = await collectDiff(dir)
    expect(target.files.some((f) => f.path.endsWith('a.ts'))).toBe(true)
    expect(target.raw).toContain('-const x = 1')
    expect(target.raw).toContain('+const x = 2')
  })

  it('includes staged changed files', async () => {
    await initGitRepo(dir)
    writeFileSync(join(dir, 'b.ts'), 'const y = 1')
    await execa('git', ['add', '.'], { cwd: dir })
    await execa('git', ['commit', '-m', 'init'], { cwd: dir })
    writeFileSync(join(dir, 'b.ts'), 'const y = 99')
    await execa('git', ['add', '.'], { cwd: dir })
    const target = await collectDiff(dir)
    expect(target.files.some((f) => f.path.endsWith('b.ts'))).toBe(true)
    expect(target.raw).toContain('+const y = 99')
  })

  it('resolves paths relative to git repo root when run from a subdirectory', async () => {
    await initGitRepo(dir)
    writeFileSync(join(dir, 'root.ts'), 'const r = 1')
    await execa('git', ['add', '.'], { cwd: dir })
    await execa('git', ['commit', '-m', 'init'], { cwd: dir })
    writeFileSync(join(dir, 'root.ts'), 'const r = 2')
    const sub = join(dir, 'src')
    mkdirSync(sub, { recursive: true })
    const target = await collectDiff(sub)
    expect(target.files.some((f) => f.path.endsWith('root.ts'))).toBe(true)
  })
})
