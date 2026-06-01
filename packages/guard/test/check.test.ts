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

describe('checkCommand', () => {
  let dir: string
  let stderrSpy: ReturnType<typeof vi.spyOn>
  let stdoutSpy: ReturnType<typeof vi.spyOn>
  let cwdSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    dir = join(tmpdir(), `guard-check-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(dir)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(dir, { recursive: true, force: true })
  })

  it('exits 2 when no input source given', async () => {
    const exit = mockExit()
    await expect(checkCommand({ args: [] })).rejects.toThrow(MockExit)
    expect(exit).toHaveBeenCalledWith(2)
    expect(stderrSpy.mock.calls.map((c) => c[0]).join('')).toContain('no input specified')
  })

  it('exits 2 when no GUARD.md found', async () => {
    const exit = mockExit()
    await expect(checkCommand({ args: [dir] })).rejects.toThrow(MockExit)
    expect(exit).toHaveBeenCalledWith(2)
    expect(stderrSpy.mock.calls.map((c) => c[0]).join('')).toContain('no GUARD.md found')
  })

  it('warns when provider is not mock', async () => {
    const exit = mockExit()
    writeFileSync(join(dir, 'GUARD.md'), '---\nprovider: openai\n---\n# Policy')
    const file = join(dir, 'a.ts')
    writeFileSync(file, 'const x = 1')
    await expect(checkCommand({ args: [file] })).rejects.toThrow(MockExit)
    expect(stderrSpy.mock.calls.map((c) => c[0]).join('')).toContain('not yet implemented')
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
})
