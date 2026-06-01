import type { GuardInclude } from '../types.js'

function githubRawUrl(include: { github: string; ref?: string; path?: string }): string {
  const [owner, repo, ...rest] = include.github.split('/')
  const subpath = rest.length > 0 ? rest.join('/') : ''
  const ref = include.ref ?? 'main'
  const filePath = include.path ?? (subpath ? `${subpath}/GUARD.md` : 'GUARD.md')
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${filePath}`
}

function resolveUrl(inc: GuardInclude): string | null {
  if (typeof inc === 'string') {
    if (inc.startsWith('github:')) {
      return githubRawUrl({ github: inc.slice('github:'.length) })
    }
    process.stderr.write(`warn: unknown include format: ${inc}\n`)
    return null
  }
  return githubRawUrl(inc)
}

export async function resolveIncludes(includes: GuardInclude[]): Promise<string> {
  const results = await Promise.all(
    includes.map((inc) => {
      const url = resolveUrl(inc)
      return url ? fetchRemote(url) : Promise.resolve(null)
    }),
  )
  return results.filter(Boolean).join('\n\n')
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
