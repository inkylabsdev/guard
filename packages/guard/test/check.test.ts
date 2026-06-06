import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { checkCommand } from '../src/commands/check.js'

class MockExit extends Error {
  constructor(public code: number | undefined) { super(`exit(${code})`) }
}

function mockExit() {
  return vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new MockExit(code as number | undefined)
  })
}

function writePackageRule(root: string, id = 'sample-rule', dependsOn: string[] = []) {
  const ruleDir = join(root, 'src', id)
  mkdirSync(ruleDir, { recursive: true })
  writeFileSync(join(root, 'package.json'), '{}')
  writeFileSync(join(ruleDir, 'GUARD.md'), `---
id: ${id}
severity: warning
description: Sample rule
depends_on: ${JSON.stringify(dependsOn)}
---
## Rule

No secrets.`)
}

describe('checkCommand', () => {
  let dir: string
  let stderrSpy: ReturnType<typeof vi.spyOn>
  let stdoutSpy: ReturnType<typeof vi.spyOn>
  let _cwdSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    dir = join(tmpdir(), `guard-check-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    _cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(dir)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env['GUARD_AGENT_CONCURRENCY']
    rmSync(dir, { recursive: true, force: true })
  })

  it('exits 2 when no input source given', async () => {
    const exit = mockExit()
    await expect(checkCommand({ args: [] })).rejects.toThrow(MockExit)
    expect(exit).toHaveBeenCalledWith(2)
    expect(stderrSpy.mock.calls.map((c) => c[0]).join('')).toContain('no input specified')
  })

  it('exits 2 when no guard project is found', async () => {
    const exit = mockExit()
    await expect(checkCommand({ args: [dir] })).rejects.toThrow(MockExit)
    expect(exit).toHaveBeenCalledWith(2)
    expect(stderrSpy.mock.calls.map((c) => c[0]).join('')).toContain('no guard project found')
  })

  it('exits 2 when both guard formats are present', async () => {
    const exit = mockExit()
    writeFileSync(join(dir, 'GUARD.md'), '# Policy')
    writeFileSync(join(dir, 'package.json'), '{}')
    mkdirSync(join(dir, 'src'))
    await expect(checkCommand({ args: [dir] })).rejects.toThrow(MockExit)
    expect(exit).toHaveBeenCalledWith(2)
    expect(stderrSpy.mock.calls.map((c) => c[0]).join('')).toContain('both GUARD.md and package.json')
  })

  it('exits 2 when package loading fails', async () => {
    const exit = mockExit()
    writePackageRule(dir, 'child', ['missing'])
    const file = join(dir, 'clean.ts')
    writeFileSync(file, 'const x = 1')
    await expect(checkCommand({ args: [file] })).rejects.toThrow(MockExit)
    expect(exit).toHaveBeenCalledWith(2)
    expect(stderrSpy.mock.calls.map((c) => c[0]).join('')).toContain('depends on missing rule')
  })

  it('throws when the specified model is unknown', async () => {
    writeFileSync(join(dir, 'GUARD.md'), '# Policy')
    const file = join(dir, 'a.ts')
    writeFileSync(file, 'const x = 1')
    await expect(checkCommand({ args: [file], provider: 'openai', model: 'missing' })).rejects.toThrow('Unknown model')
  })

  it('exits 2 when GUARD_AGENT_CONCURRENCY is invalid', async () => {
    const exit = mockExit()
    process.env['GUARD_AGENT_CONCURRENCY'] = '0'
    writeFileSync(join(dir, 'GUARD.md'), '# Policy')
    const file = join(dir, 'a.ts')
    writeFileSync(file, 'const x = 1')

    await expect(checkCommand({ args: [file] })).rejects.toThrow(MockExit)

    expect(exit).toHaveBeenCalledWith(2)
    expect(stderrSpy.mock.calls.map((c) => c[0]).join('')).toContain('GUARD_AGENT_CONCURRENCY')
  })

  it('accepts valid GUARD_AGENT_CONCURRENCY values', async () => {
    const exit = mockExit()
    process.env['GUARD_AGENT_CONCURRENCY'] = '2'
    writeFileSync(join(dir, 'GUARD.md'), '# Policy')
    const file = join(dir, 'a.ts')
    writeFileSync(file, 'const x = 1')

    await expect(checkCommand({ args: [file] })).rejects.toThrow(MockExit)

    expect(exit).toHaveBeenCalledWith(0)
  })

  it('exits 0 and prints PASS for clean input', async () => {
    const exit = mockExit()
    writeFileSync(join(dir, 'GUARD.md'), '# Policy\n- Be good.')
    const file = join(dir, 'clean.ts')
    writeFileSync(file, 'const x = 1')
    await expect(checkCommand({ args: [file] })).rejects.toThrow(MockExit)
    expect(exit).toHaveBeenCalledWith(0)
    expect(stdoutSpy.mock.calls.map((c) => c[0]).join('')).toContain('PASS')
  })

  it('exits 1 and prints FAIL for policy violation', async () => {
    const exit = mockExit()
    writeFileSync(join(dir, 'GUARD.md'), '# Policy\n- No secrets.')
    const file = join(dir, 'bad.ts')
    writeFileSync(file, 'console.log(secret)')
    await expect(checkCommand({ args: [file] })).rejects.toThrow(MockExit)
    expect(exit).toHaveBeenCalledWith(1)
    expect(stdoutSpy.mock.calls.map((c) => c[0]).join('')).toContain('FAIL')
  })

  it('accepts --diff flag', async () => {
    const exit = mockExit()
    writeFileSync(join(dir, 'GUARD.md'), '# Policy')
    await expect(checkCommand({ diff: true, args: [] })).rejects.toThrow(MockExit)
    expect(exit).toHaveBeenCalledWith(0)
  })

  it('skips single-policy file checks when no files are collected', async () => {
    const exit = mockExit()
    writeFileSync(join(dir, 'GUARD.md'), '# Policy')
    const emptyDir = join(dir, 'empty')
    mkdirSync(emptyDir)

    await expect(checkCommand({ args: [emptyDir] })).rejects.toThrow(MockExit)

    expect(exit).toHaveBeenCalledWith(0)
    expect(stdoutSpy.mock.calls.map((c) => c[0]).join('')).toContain('No policy violations found')
  })

  it('runs package mode and exits 0 for clean input', async () => {
    const exit = mockExit()
    writePackageRule(dir)
    const file = join(dir, 'clean.ts')
    writeFileSync(file, 'const x = 1')
    await expect(checkCommand({ args: [file] })).rejects.toThrow(MockExit)
    expect(exit).toHaveBeenCalledWith(0)
    expect(stdoutSpy.mock.calls.map((c) => c[0]).join('')).toContain('PASS')
  })

  it('runs package mode and exits 1 for rule failures', async () => {
    const exit = mockExit()
    writePackageRule(dir)
    const file = join(dir, 'bad.ts')
    writeFileSync(file, 'console.log(secret)')
    await expect(checkCommand({ args: [file] })).rejects.toThrow(MockExit)
    expect(exit).toHaveBeenCalledWith(1)
    expect(stdoutSpy.mock.calls.map((c) => c[0]).join('')).toContain('FAIL')
  })

  it('warns that max iterations is ignored in package mode', async () => {
    const exit = mockExit()
    writePackageRule(dir)
    const file = join(dir, 'clean.ts')
    writeFileSync(file, 'const x = 1')

    await expect(checkCommand({ args: [file], maxIterations: 7 })).rejects.toThrow(MockExit)

    expect(exit).toHaveBeenCalledWith(0)
    expect(stderrSpy.mock.calls.map((c) => c[0]).join('')).toContain('--max-iterations is deprecated')
  })
})
