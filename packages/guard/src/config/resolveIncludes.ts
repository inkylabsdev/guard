import { existsSync, readFileSync } from 'fs'
import { isAbsolute, resolve } from 'path'
import type { GuardInclude } from '../types.js'

function githubRawUrl(include: { github: string; ref?: string; path?: string }): string {
  const [owner, repo, ...rest] = include.github.split('/')
  const subpath = rest.length > 0 ? rest.join('/') : ''
  const ref = include.ref ?? 'main'
  const filePath = include.path ?? (subpath ? `${subpath}/GUARD.md` : 'GUARD.md')
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${filePath}`
}

type ResolvedInclude =
  | { type: 'remote'; url: string }
  | { type: 'local'; path: string }

function resolveInclude(inc: GuardInclude, baseDir?: string): ResolvedInclude | null {
  if (typeof inc === 'string') {
    if (inc.startsWith('github:')) {
      return { type: 'remote', url: githubRawUrl({ github: inc.slice('github:'.length) }) }
    }
    if (baseDir) {
      return { type: 'local', path: isAbsolute(inc) ? inc : resolve(baseDir, inc) }
    }
    process.stderr.write(`warn: unknown include format: ${inc}\n`)
    return null
  }
  return { type: 'remote', url: githubRawUrl(inc) }
}

export async function resolveIncludes(includes: GuardInclude[], baseDir?: string): Promise<string> {
  const results = await Promise.all(
    includes.map((inc) => {
      const resolved = resolveInclude(inc, baseDir)
      if (!resolved) return Promise.resolve(null)
      return resolved.type === 'remote' ? fetchRemote(resolved.url) : Promise.resolve(readLocal(resolved.path))
    }),
  )
  return results.filter(Boolean).join('\n\n')
}

function readLocal(path: string): string | null {
  if (!existsSync(path)) {
    process.stderr.write(`warn: failed to read include ${path}: file not found\n`)
    return null
  }
  try {
    return readFileSync(path, 'utf8')
  } catch (err) {
    process.stderr.write(`warn: failed to read include ${path}: ${String(err)}\n`)
    return null
  }
}

async function fetchRemote(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) {
      process.stderr.write(`warn: failed to fetch include ${url}: HTTP ${res.status}\n`)
      return null
    }
    return await res.text()
  } catch (err) {
    process.stderr.write(`warn: failed to fetch include ${url}: ${String(err)}\n`)
    return null
  }
}
