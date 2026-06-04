import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
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
    expect(parsePackageUrl('git::https://example.com/demo.git//../outside')).toEqual({
      repoUrl: 'https://example.com/demo.git',
      subdirectory: '../outside',
    })
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

  it('throws when GUARD_REGISTRY_URL is not https', async () => {
    process.env['GUARD_REGISTRY_URL'] = 'http://example.com/registry.json'

    await expect(loadRegistry()).rejects.toThrow('GUARD_REGISTRY_URL must use https://')
  })

  it('throws when registry package names are duplicated', async () => {
    const dir = join(tmpdir(), `guard-registry-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
    process.env['GUARD_REGISTRY_PATH'] = writeRegistry(dir, [
      {
        name: 'demo-guard',
        description: 'Demo guard package.',
        license: 'MIT',
        homepage: 'https://example.com/demo-guard',
        url: 'git::https://example.com/demo-guard.git',
      },
      {
        name: 'demo-guard',
        description: 'Duplicate guard package.',
        license: 'MIT',
        homepage: 'https://example.com/demo-guard-2',
        url: 'git::https://example.com/demo-guard-2.git',
      },
    ])

    await expect(loadRegistry()).rejects.toThrow('duplicate registry package name: demo-guard')

    rmSync(dir, { recursive: true, force: true })
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
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toContain('.guard_modules/\n')
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

  it('exits 0 with a message when no dependencies are specified', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    writeFileSync(join(dir, 'GUARD.md'), '# Policy')

    await installCommand({ args: [] })

    expect(stdoutSpy.mock.calls.map((c) => c[0]).join('')).toContain('no guard dependencies to install')
    expect(stderrSpy).not.toHaveBeenCalled()
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
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe('.guard_modules/\n')
  })

  it('installs a relative path dependency from the project root', async () => {
    mkdirSync(join(dir, 'packages', 'local-guard'), { recursive: true })
    writeFileSync(join(dir, 'packages', 'local-guard', 'GUARD.md'), '# Local')

    await installDependencies(dir, ['./packages/local-guard'])

    expect(execaMock).not.toHaveBeenCalled()
    expect(existsSync(join(dir, '.guard_modules', 'local-guard', 'GUARD.md'))).toBe(true)
    expect(readFileSync(join(dir, '.guard_modules', 'local-guard', 'GUARD.md'), 'utf8')).toBe('# Local')
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe('.guard_modules/\n')
  })

  it('installs an absolute path dependency', async () => {
    const sourceDir = join(tmpdir(), `guard-absolute-source-${Date.now()}`)
    mkdirSync(sourceDir, { recursive: true })
    writeFileSync(join(sourceDir, 'GUARD.md'), '# Absolute')

    await installDependencies(dir, [sourceDir])

    expect(execaMock).not.toHaveBeenCalled()
    expect(readFileSync(join(dir, '.guard_modules', basename(sourceDir), 'GUARD.md'), 'utf8')).toBe('# Absolute')

    rmSync(sourceDir, { recursive: true, force: true })
  })

  it('skips existing dependency directories unless reinstall is requested', async () => {
    process.env['GUARD_REGISTRY_PATH'] = writeRegistry(dir, [
      {
        name: 'demo-guard',
        description: 'Demo guard package.',
        license: 'MIT',
        homepage: 'https://example.com/demo-guard',
        url: 'git::https://example.com/demo-guard.git',
      },
    ])
    mkdirSync(join(dir, '.guard_modules', 'demo-guard'), { recursive: true })
    writeFileSync(join(dir, '.guard_modules', 'demo-guard', 'GUARD.md'), '# Existing')

    await installDependencies(dir, ['demo-guard'])

    expect(execaMock).not.toHaveBeenCalled()
    expect(readFileSync(join(dir, '.guard_modules', 'demo-guard', 'GUARD.md'), 'utf8')).toBe('# Existing')

    await installDependencies(dir, ['demo-guard'], { reinstall: true })

    expect(execaMock).toHaveBeenCalledTimes(1)
    expect(readFileSync(join(dir, '.guard_modules', 'demo-guard', 'GUARD.md'), 'utf8')).toBe('# Demo')
  })

  it('does not duplicate an existing gitignore entry', async () => {
    process.env['GUARD_REGISTRY_PATH'] = writeRegistry(dir, [
      {
        name: 'demo-guard',
        description: 'Demo guard package.',
        license: 'MIT',
        homepage: 'https://example.com/demo-guard',
        url: 'git::https://example.com/demo-guard.git',
      },
    ])
    writeFileSync(join(dir, '.gitignore'), 'dist\n.guard_modules/\n')

    await installDependencies(dir, ['demo-guard'])

    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe('dist\n.guard_modules/\n')
  })

  it('appends gitignore entry after a file without trailing newline', async () => {
    process.env['GUARD_REGISTRY_PATH'] = writeRegistry(dir, [
      {
        name: 'demo-guard',
        description: 'Demo guard package.',
        license: 'MIT',
        homepage: 'https://example.com/demo-guard',
        url: 'git::https://example.com/demo-guard.git',
      },
    ])
    writeFileSync(join(dir, '.gitignore'), 'dist')

    await installDependencies(dir, ['demo-guard'])

    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe('dist\n.guard_modules/\n')
  })

  it('throws when a dependency is missing from the registry', async () => {
    process.env['GUARD_REGISTRY_PATH'] = writeRegistry(dir, [])

    await expect(installDependencies(dir, ['missing'])).rejects.toThrow('dependency not found in registry')
  })

  it('throws when a dependency name does not match the registry name pattern', async () => {
    process.env['GUARD_REGISTRY_PATH'] = writeRegistry(dir)

    await expect(installDependencies(dir, ['../bad'])).rejects.toThrow('dependency name must match')
  })

  it('throws when a relative path dependency escapes the project root', async () => {
    await expect(installDependencies(dir, ['./../bad'])).rejects.toThrow('relative dependency path must not escape project root')
  })

  it('throws when a path dependency is missing', async () => {
    await expect(installDependencies(dir, ['./missing-guard'])).rejects.toThrow('dependency path must point to an existing directory')
  })

  it('throws when a path dependency has no module directory name', async () => {
    await expect(installDependencies(dir, ['/'])).rejects.toThrow('dependency path must include a module directory name: /')
  })

  it('throws when path dependency module names collide', async () => {
    mkdirSync(join(dir, 'a', 'local-guard'), { recursive: true })
    writeFileSync(join(dir, 'a', 'local-guard', 'GUARD.md'), '# A')
    const otherDir = join(tmpdir(), `guard-collision-${Date.now()}`, 'local-guard')
    mkdirSync(otherDir, { recursive: true })
    writeFileSync(join(otherDir, 'GUARD.md'), '# B')

    await expect(installDependencies(dir, ['./a/local-guard', otherDir])).rejects.toThrow('dependency module name collision: local-guard')

    rmSync(join(otherDir, '..'), { recursive: true, force: true })
  })

  it('throws when a registry subdirectory is missing', async () => {
    process.env['GUARD_REGISTRY_PATH'] = writeRegistry(dir)
    execaMock.mockImplementation(async (_cmd: string, args: string[]) => {
      mkdirSync(args[args.length - 1], { recursive: true })
      return { failed: false, stdout: '' }
    })

    await expect(installDependencies(dir, ['demo-guard'])).rejects.toThrow('registry package subdirectory not found')
  })

  it('throws when a registry subdirectory traverses outside the repository', async () => {
    process.env['GUARD_REGISTRY_PATH'] = writeRegistry(dir, [
      {
        name: 'bad-guard',
        description: 'Bad guard package.',
        license: 'MIT',
        homepage: 'https://example.com/bad-guard',
        url: 'git::https://example.com/bad-guard.git//../bad',
      },
    ])

    await expect(installDependencies(dir, ['bad-guard'])).rejects.toThrow('must not traverse outside repository')
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

  it('installs dependencies before resolving local package includes', async () => {
    const exit = mockExit()
    writeFileSync(join(dir, 'GUARD.md'), `---
dependencies:
  - demo-guard
include:
  - .guard_modules/demo-guard/GUARD.md
---
# Policy
- Be good.`)
    const file = join(dir, 'clean.ts')
    writeFileSync(file, 'const x = 1')

    await expect(checkCommand({ args: [file] })).rejects.toThrow(MockExit)

    expect(exit).toHaveBeenCalledWith(0)
    expect(existsSync(join(dir, '.guard_modules', 'demo-guard', 'GUARD.md'))).toBe(true)
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
