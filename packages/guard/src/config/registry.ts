import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { dirname, isAbsolute, join, relative, resolve } from 'path'
import { execa } from 'execa'
import { z } from 'zod'
import type { RegistryPackage } from '../types.js'

const DEFAULT_REGISTRY_URL = 'https://raw.githubusercontent.com/inkylabsdev/guard-registry/main/registry.json'
export const DEPENDENCY_NAME_RE = /^[a-z0-9][a-z0-9_-]+$/

const RegistryPackageSchema = z.object({
  name: z.string().regex(DEPENDENCY_NAME_RE),
  description: z.string(),
  license: z.string(),
  homepage: z.string(),
  url: z.string().regex(/^git::https:\/\/.+\.git(\/\/.*)?$/),
})

const RegistrySchema = z.array(RegistryPackageSchema)

type PackageSource = {
  repoUrl: string
  subdirectory?: string
}

function registryUrl(): string {
  const url = process.env['GUARD_REGISTRY_URL'] ?? DEFAULT_REGISTRY_URL
  if (!url.startsWith('https://')) {
    throw new Error('GUARD_REGISTRY_URL must use https://')
  }
  return url
}

async function readRegistryRaw(): Promise<string> {
  const registryPath = process.env['GUARD_REGISTRY_PATH']
  if (registryPath) return readFileSync(registryPath, 'utf8')

  const res = await fetch(registryUrl())
  if (!res.ok) {
    throw new Error(`failed to fetch registry: HTTP ${res.status}`)
  }
  return await res.text()
}

export async function loadRegistry(): Promise<RegistryPackage[]> {
  const registry = RegistrySchema.parse(JSON.parse(await readRegistryRaw()))
  const names = new Set<string>()
  for (const entry of registry) {
    if (names.has(entry.name)) {
      throw new Error(`duplicate registry package name: ${entry.name}`)
    }
    names.add(entry.name)
  }
  return registry
}

export function parsePackageUrl(url: string): PackageSource {
  if (!url.startsWith('git::')) {
    throw new Error(`registry package url must start with git::: ${url}`)
  }

  const source = url.slice('git::'.length)
  const gitSuffix = '.git'
  const gitIndex = source.indexOf(gitSuffix)
  if (gitIndex === -1) {
    throw new Error(`registry package url must point to a .git repository: ${url}`)
  }

  const repoUrl = source.slice(0, gitIndex + gitSuffix.length)
  const rest = source.slice(gitIndex + gitSuffix.length)
  if (rest && !rest.startsWith('//')) {
    throw new Error(`registry package url subdirectory must start with //: ${url}`)
  }

  const subdirectory = rest ? rest.slice('//'.length).replace(/^\/+|\/+$/g, '') : undefined
  return { repoUrl, subdirectory: subdirectory || undefined }
}

function validateDependencyName(name: string): void {
  if (!DEPENDENCY_NAME_RE.test(name)) {
    throw new Error(`dependency name must match ${DEPENDENCY_NAME_RE}: ${name}`)
  }
}

function moduleDir(projectRoot: string, name: string): string {
  validateDependencyName(name)
  return join(projectRoot, '.guard_modules', name)
}

function sourceSubdirectory(tempRepo: string, source: PackageSource, url: string): string {
  if (!source.subdirectory) return tempRepo

  const sourceDir = resolve(tempRepo, source.subdirectory)
  const relativeSource = relative(tempRepo, sourceDir)
  if (relativeSource.startsWith('..') || isAbsolute(relativeSource)) {
    throw new Error(`registry package url subdirectory must not traverse outside repository: ${url}`)
  }
  return sourceDir
}

async function clonePackage(entry: RegistryPackage, destination: string): Promise<void> {
  const source = parsePackageUrl(entry.url)
  const tempDir = `${destination}.tmp-${process.pid}-${Date.now()}`
  const tempRepo = join(tempDir, 'repo')

  rmSync(tempDir, { recursive: true, force: true })
  mkdirSync(tempDir, { recursive: true })

  try {
    await execa('git', ['clone', '--depth', '1', source.repoUrl, tempRepo])

    const sourceDir = sourceSubdirectory(tempRepo, source, entry.url)
    if (!existsSync(sourceDir)) {
      throw new Error(`registry package subdirectory not found: ${entry.name}`)
    }

    rmSync(destination, { recursive: true, force: true })
    mkdirSync(dirname(destination), { recursive: true })
    cpSync(sourceDir, destination, {
      recursive: true,
      filter: (src) => !src.endsWith('/.git') && !src.includes('/.git/'),
    })
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

function ensureGitignore(projectRoot: string): void {
  const gitignorePath = join(projectRoot, '.gitignore')
  const entry = '.guard_modules/'
  const current = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : ''
  const lines = current.split(/\r?\n/)
  if (lines.includes(entry)) return

  const prefix = current.length > 0 && !current.endsWith('\n') ? '\n' : ''
  writeFileSync(gitignorePath, `${current}${prefix}${entry}\n`)
}

export type InstallDependenciesOptions = {
  reinstall?: boolean
}

export async function installDependencies(projectRoot: string, dependencies: string[], opts: InstallDependenciesOptions = {}): Promise<void> {
  if (dependencies.length === 0) return

  const dependencyNames = [...new Set(dependencies)].sort()
  for (const dependency of dependencyNames) {
    validateDependencyName(dependency)
  }

  const registry = await loadRegistry()
  const byName = new Map(registry.map((entry) => [entry.name, entry]))

  for (const dependency of dependencyNames) {
    const entry = byName.get(dependency)
    if (!entry) {
      throw new Error(`dependency not found in registry: ${dependency}`)
    }

    const destination = moduleDir(projectRoot, dependency)
    if (existsSync(destination) && !opts.reinstall) continue

    await clonePackage(entry, destination)
  }

  ensureGitignore(projectRoot)
}
