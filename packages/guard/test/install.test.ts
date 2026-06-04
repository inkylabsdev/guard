import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const execaMock = vi.hoisted(() => vi.fn())

vi.mock('execa', () => ({
  execa: execaMock,
}))

import { checkCommand } from '../src/commands/check.js'
import { installCommand } from '../src/commands/install.js'
import { installDependencies, loadRegistry, parsePackageUrl } from '../src/config/registry.js'

class MockExit extends Error {
  constructor(public code: number | undefined) { super(`exit(${code})`) }
}

function mockExit() {
  return vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new MockExit(code as number | undefined)
  })
}

type RegistryFixture = {
  name: string
  description: string
  license: string
  homepage: string
  url: string
}

function writeRegistry(dir: string, entries?: RegistryFixture[]): string {
  const registryPath = join(dir, 'registry.json')
  writeFileSync(registryPath, JSON.stringify(entries ?? [
    {
      name: 'demo-guard',
      description: 'Demo guard package.',
      license: 'MIT',
      homepage: 'https://example.com/demo-guard',
      url: 'git::https://example.com/demo-guard.git//package',
    },
  ]))
  return registryPath
}

describe('registry package urls', () => {
  it('parses repository urls with optional subdirectories', () => {
    expect(parsePackageUrl('git::https://example.com/demo.git')).toEqual({
      repoUrl: 'https://example.com/demo.git',
      subdirectory: undefined,
    })
    expect(parsePackageUrl('git::https://example.com/demo.git//packages/demo/')).toEqual({
      repoUrl: 'https://example.com/demo.git',
      subdirectory: 'packages/demo',
    })
  })

  it('rejects malformed package urls', () => {
    expect(() => parsePackageUrl('https://example.com/demo.git')).toThrow('must start with git::')
    expect(() => parsePackageUrl('git::https://example.com/demo')).toThrow('must point to a .git repository')
    expect(() => parsePackageUrl('git::https://example.com/demo.git/packages/demo')).toThrow('subdirectory must start with //')
  })
})

describe('loadRegistry', () => {
  let oldRegistryPath: string | undefined
  let oldRegistryUrl: string | undefined
  let oldFetch: typeof globalThis.fetch

  beforeEach(() => {
    oldRegistryPath = process.env['GUARD_REGISTRY_PATH']
    oldRegistryUrl = process.env['GUARD_REGISTRY_URL']
    oldFetch = globalThis.fetch
    delete process.env['GUARD_REGISTRY_PATH']
    delete process.env['GUARD_REGISTRY_URL']
  })

  afterEach(() => {
    if (oldRegistryPath === undefined) {
      delete process.env['GUARD_REGISTRY_PATH']
    } else {
      process.env['GUARD_REGISTRY_PATH'] = oldRegistryPath
    }
    if (oldRegistryUrl === undefined) {
      delete process.env['GUARD_REGISTRY_URL']
    } else {
      process.env['GUARD_REGISTRY_URL'] = oldRegistryUrl
    }
    globalThis.fetch = oldFetch
  })

  it('loads the default remote registry', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify([
        {
          name: 'demo-guard',
          description: 'Demo guard package.',
          license: 'MIT',
          homepage: 'https://example.com/demo-guard',
          url: 'git::https://example.com/demo-guard.git',
        },
      ]),
    })) as unknown as typeof fetch
    globalThis.fetch = fetchMock

    const registry = await loadRegistry()

    expect(registry[0].name).toBe('demo-guard')
    expect(fetchMock).toHaveBeenCalledWith('https://raw.githubusercontent.com/inkylabsdev/guard-registry/main/registry.json')
  })

  it('throws when registry fetch fails', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404 })) as unknown as typeof fetch

    await expect(loadRegistry()).rejects.toThrow('failed to fetch registry: HTTP 404')
  })
})

describe('installCommand', () => {
  let dir: string
  let oldRegistryPath: string | undefined
  let _cwdSpy: ReturnType<typeof vi.spyOn>
  let stderrSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    dir = join(tmpdir(), `guard-install-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
    oldRegistryPath = process.env['GUARD_REGISTRY_PATH']
    process.env['GUARD_REGISTRY_PATH'] = writeRegistry(dir)
    _cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(dir)
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    execaMock.mockImplementation(async (_cmd: string, args: string[]) => {
      const repoDir = args[args.length - 1]
      mkdirSync(join(repoDir, 'package'), { recursive: true })
      writeFileSync(join(repoDir, 'package', 'GUARD.md'), '# Demo')
      return { failed: false, stdout: '' }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    execaMock.mockReset()
    if (oldRegistryPath === undefined) {
      delete process.env['GUARD_REGISTRY_PATH']
    } else {
      process.env['GUARD_REGISTRY_PATH'] = oldRegistryPath
    }
    rmSync(dir, { recursive: true, force: true })
  })

  it('installs dependencies from root GUARD.md into .guard_modules', async () => {
    writeFileSync(join(dir, 'GUARD.md'), `---
dependencies:
  - demo-guard
---
# Policy`)

    await installCommand({ args: [] })

    expect(execaMock).toHaveBeenCalledWith('git', ['clone', '--depth', '1', 'https://example.com/demo-guard.git', expect.any(String)])
    expect(existsSync(join(dir, '.guard_modules', 'demo-guard', 'GUARD.md'))).toBe(true)
  })

  it('installs explicit dependency arguments', async () => {
    writeFileSync(join(dir, 'GUARD.md'), '# Policy')

    await installCommand({ args: ['demo-guard'] })

    expect(existsSync(join(dir, '.guard_modules', 'demo-guard', 'GUARD.md'))).toBe(true)
  })

  it('exits 2 when no root GUARD.md is found', async () => {
    const exit = mockExit()

    await expect(installCommand({ args: ['demo-guard'] })).rejects.toThrow(MockExit)

    expect(exit).toHaveBeenCalledWith(2)
    expect(stderrSpy.mock.calls.map((c) => c[0]).join('')).toContain('no guard project found')
  })

  it('exits 2 when the project is a guard package', async () => {
    const exit = mockExit()
    writeFileSync(join(dir, 'package.json'), '{}')
    mkdirSync(join(dir, 'src'))

    await expect(installCommand({ args: ['demo-guard'] })).rejects.toThrow(MockExit)

    expect(exit).toHaveBeenCalledWith(2)
    expect(stderrSpy.mock.calls.map((c) => c[0]).join('')).toContain('requires a project root GUARD.md')
  })

  it('exits 2 when no dependencies are specified', async () => {
    const exit = mockExit()
    writeFileSync(join(dir, 'GUARD.md'), '# Policy')

    await expect(installCommand({ args: [] })).rejects.toThrow(MockExit)

    expect(exit).toHaveBeenCalledWith(2)
    expect(stderrSpy.mock.calls.map((c) => c[0]).join('')).toContain('no dependencies specified')
  })
})

describe('installDependencies', () => {
  let dir: string
  let oldRegistryPath: string | undefined

  beforeEach(() => {
    dir = join(tmpdir(), `guard-install-deps-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
    oldRegistryPath = process.env['GUARD_REGISTRY_PATH']
    execaMock.mockImplementation(async (_cmd: string, args: string[]) => {
      const repoDir = args[args.length - 1]
      mkdirSync(repoDir, { recursive: true })
      writeFileSync(join(repoDir, 'GUARD.md'), '# Demo')
      mkdirSync(join(repoDir, '.git'), { recursive: true })
      writeFileSync(join(repoDir, '.git', 'config'), '[core]')
      return { failed: false, stdout: '' }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    execaMock.mockReset()
    if (oldRegistryPath === undefined) {
      delete process.env['GUARD_REGISTRY_PATH']
    } else {
      process.env['GUARD_REGISTRY_PATH'] = oldRegistryPath
    }
    rmSync(dir, { recursive: true, force: true })
  })

  it('does nothing when dependency list is empty', async () => {
    await installDependencies(dir, [])

    expect(execaMock).not.toHaveBeenCalled()
    expect(existsSync(join(dir, '.guard_modules'))).toBe(false)
  })

  it('installs a dependency without a subdirectory', async () => {
    process.env['GUARD_REGISTRY_PATH'] = writeRegistry(dir, [
      {
        name: 'root-guard',
        description: 'Root guard package.',
        license: 'MIT',
        homepage: 'https://example.com/root-guard',
        url: 'git::https://example.com/root-guard.git',
      },
    ])

    await installDependencies(dir, ['root-guard'])

    expect(existsSync(join(dir, '.guard_modules', 'root-guard', 'GUARD.md'))).toBe(true)
    expect(existsSync(join(dir, '.guard_modules', 'root-guard', '.git'))).toBe(false)
  })

  it('throws when a dependency is missing from the registry', async () => {
    process.env['GUARD_REGISTRY_PATH'] = writeRegistry(dir, [])

    await expect(installDependencies(dir, ['missing'])).rejects.toThrow('dependency not found in registry')
  })

  it('throws when a dependency name contains path separators', async () => {
    process.env['GUARD_REGISTRY_PATH'] = writeRegistry(dir, [
      {
        name: '../bad',
        description: 'Bad guard package.',
        license: 'MIT',
        homepage: 'https://example.com/bad',
        url: 'git::https://example.com/bad.git',
      },
    ])

    await expect(installDependencies(dir, ['../bad'])).rejects.toThrow('dependency name must not contain path separators')
  })

  it('throws when a registry subdirectory is missing', async () => {
    process.env['GUARD_REGISTRY_PATH'] = writeRegistry(dir)
    execaMock.mockImplementation(async (_cmd: string, args: string[]) => {
      mkdirSync(args[args.length - 1], { recursive: true })
      return { failed: false, stdout: '' }
    })

    await expect(installDependencies(dir, ['demo-guard'])).rejects.toThrow('registry package subdirectory not found')
  })
})

describe('checkCommand dependency installation', () => {
  let dir: string
  let oldRegistryPath: string | undefined
  let _cwdSpy: ReturnType<typeof vi.spyOn>
  let stdoutSpy: ReturnType<typeof vi.spyOn>
  let stderrSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    dir = join(tmpdir(), `guard-check-install-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
    oldRegistryPath = process.env['GUARD_REGISTRY_PATH']
    process.env['GUARD_REGISTRY_PATH'] = writeRegistry(dir)
    _cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(dir)
    stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    execaMock.mockImplementation(async (_cmd: string, args: string[]) => {
      const repoDir = args[args.length - 1]
      mkdirSync(join(repoDir, 'package'), { recursive: true })
      writeFileSync(join(repoDir, 'package', 'GUARD.md'), '# Demo')
      return { failed: false, stdout: '' }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    execaMock.mockReset()
    if (oldRegistryPath === undefined) {
      delete process.env['GUARD_REGISTRY_PATH']
    } else {
      process.env['GUARD_REGISTRY_PATH'] = oldRegistryPath
    }
    rmSync(dir, { recursive: true, force: true })
  })

  it('installs dependencies before checking a root GUARD.md project', async () => {
    const exit = mockExit()
    writeFileSync(join(dir, 'GUARD.md'), `---
dependencies:
  - demo-guard
---
# Policy
- Be good.`)
    const file = join(dir, 'clean.ts')
    writeFileSync(file, 'const x = 1')

    await expect(checkCommand({ args: [file] })).rejects.toThrow(MockExit)

    expect(exit).toHaveBeenCalledWith(0)
    expect(existsSync(join(dir, '.guard_modules', 'demo-guard', 'GUARD.md'))).toBe(true)
    expect(stdoutSpy.mock.calls.map((c) => c[0]).join('')).toContain('PASS')
    expect(stderrSpy.mock.calls.map((c) => c[0]).join('')).toBe('')
  })

  it('exits 2 when automatic dependency installation fails', async () => {
    const exit = mockExit()
    writeFileSync(join(dir, 'GUARD.md'), `---
dependencies:
  - missing
---
# Policy`)
    const file = join(dir, 'clean.ts')
    writeFileSync(file, 'const x = 1')

    await expect(checkCommand({ args: [file] })).rejects.toThrow(MockExit)

    expect(exit).toHaveBeenCalledWith(2)
    expect(stderrSpy.mock.calls.map((c) => c[0]).join('')).toContain('dependency not found in registry')
  })
})
