import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { basename, dirname, join } from 'path'
import { execa } from 'execa'
import { z } from 'zod'
import type { RegistryPackage } from '../types.js'

const DEFAULT_REGISTRY_URL = 'https://raw.githubusercontent.com/inkylabsdev/guard-registry/main/registry.json'

const RegistryPackageSchema = z.object({
  name: z.string().min(1),
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
  return process.env['GUARD_REGISTRY_URL'] ?? DEFAULT_REGISTRY_URL
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
  return RegistrySchema.parse(JSON.parse(await readRegistryRaw()))
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

function moduleDir(projectRoot: string, name: string): string {
  const safeName = basename(name)
  if (safeName !== name) {
    throw new Error(`dependency name must not contain path separators: ${name}`)
  }
  return join(projectRoot, '.guard_modules', safeName)
}

async function clonePackage(entry: RegistryPackage, destination: string): Promise<void> {
  const source = parsePackageUrl(entry.url)
  const tempDir = `${destination}.tmp-${process.pid}-${Date.now()}`
  const tempRepo = join(tempDir, 'repo')

  rmSync(tempDir, { recursive: true, force: true })
  mkdirSync(tempDir, { recursive: true })

  try {
    await execa('git', ['clone', '--depth', '1', source.repoUrl, tempRepo])

    const sourceDir = source.subdirectory ? join(tempRepo, source.subdirectory) : tempRepo
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

export async function installDependencies(projectRoot: string, dependencies: string[]): Promise<void> {
  if (dependencies.length === 0) return

  const registry = await loadRegistry()
  const byName = new Map(registry.map((entry) => [entry.name, entry]))

  for (const dependency of [...new Set(dependencies)].sort()) {
    const entry = byName.get(dependency)
    if (!entry) {
      throw new Error(`dependency not found in registry: ${dependency}`)
    }

    await clonePackage(entry, moduleDir(projectRoot, dependency))
  }
}
