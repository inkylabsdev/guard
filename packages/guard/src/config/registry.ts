import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path'
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

type DependencySource =
  | { kind: 'registry'; dependency: string; moduleName: string }
  | { kind: 'path'; dependency: string; moduleName: string; sourceDir: string }

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
  return join(projectRoot, '.guard_modules', name)
}

function isPathInside(parent: string, child: string): boolean {
  const relativePath = relative(parent, child)
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

function validateSourceDirectory(sourceDir: string, dependency: string): void {
  if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
    throw new Error(`dependency path must point to an existing directory: ${dependency}`)
  }
}

function dependencySource(projectRoot: string, dependency: string): DependencySource {
  if (dependency.startsWith('./')) {
    const sourceDir = resolve(projectRoot, dependency)
    if (!isPathInside(projectRoot, sourceDir)) {
      throw new Error(`relative dependency path must not escape project root: ${dependency}`)
    }
    validateSourceDirectory(sourceDir, dependency)
    return { kind: 'path', dependency, moduleName: basename(sourceDir), sourceDir }
  }

  if (isAbsolute(dependency)) {
    const sourceDir = resolve(dependency)
    validateSourceDirectory(sourceDir, dependency)
    return { kind: 'path', dependency, moduleName: basename(sourceDir), sourceDir }
  }

  validateDependencyName(dependency)
  return { kind: 'registry', dependency, moduleName: dependency }
}

function validateModuleName(moduleName: string, dependency: string): void {
  if (moduleName === '') {
    throw new Error(`dependency path must include a module directory name: ${dependency}`)
  }
}

function dependencySources(projectRoot: string, dependencies: string[]): DependencySource[] {
  const byModuleName = new Map<string, string>()
  const sources = [...new Set(dependencies)].sort().map((dependency) => dependencySource(projectRoot, dependency))

  for (const source of sources) {
    validateModuleName(source.moduleName, source.dependency)
    const existing = byModuleName.get(source.moduleName)
    if (existing && existing !== source.dependency) {
      throw new Error(`dependency module name collision: ${source.moduleName}`)
    }
    byModuleName.set(source.moduleName, source.dependency)
  }

  return sources
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

function copyPathPackage(sourceDir: string, destination: string): void {
  rmSync(destination, { recursive: true, force: true })
  mkdirSync(dirname(destination), { recursive: true })
  cpSync(sourceDir, destination, { recursive: true })
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

  const sources = dependencySources(projectRoot, dependencies)
  const registrySources = sources.filter((source) => source.kind === 'registry')
  const byName = new Map(
    registrySources.length > 0
      ? (await loadRegistry()).map((entry) => [entry.name, entry])
      : [],
  )

  for (const source of sources) {
    const destination = moduleDir(projectRoot, source.moduleName)
    if (existsSync(destination) && !opts.reinstall) continue

    if (source.kind === 'path') {
      copyPathPackage(source.sourceDir, destination)
      continue
    }

    const entry = byName.get(source.dependency)
    if (!entry) {
      throw new Error(`dependency not found in registry: ${source.dependency}`)
    }
    await clonePackage(entry, destination)
  }

  ensureGitignore(projectRoot)
}
