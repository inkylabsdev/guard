import { readFileSync, statSync, existsSync } from 'fs'
import { resolve } from 'path'
import fg from 'fast-glob'
import type { GuardFile } from '../types.js'

const IGNORED_DIRS = [
  'node_modules', '.git', 'dist', 'build', 'coverage',
  '.next', '.turbo', '.cache', 'venv', '.venv', '__pycache__',
]

const IGNORE_PATTERNS = IGNORED_DIRS.map((d) => `**/${d}/**`)

export async function collectFiles(patterns: string[], cwd: string): Promise<GuardFile[]> {
  const resolved: string[] = []
  for (const pat of patterns) {
    const abs = resolve(cwd, pat)
    if (existsSync(abs) && statSync(abs).isDirectory()) {
      const matches = await fg('**/*', {
        cwd: abs,
        absolute: true,
        dot: false,
        ignore: IGNORE_PATTERNS,
        onlyFiles: true,
      })
      resolved.push(...matches)
    } else if (fg.isDynamicPattern(pat)) {
      const matches = await fg(pat, { cwd, absolute: true, ignore: IGNORE_PATTERNS, onlyFiles: true })
      resolved.push(...matches)
    } else {
      if (existsSync(abs)) resolved.push(abs)
    }
  }
  const unique = [...new Set(resolved)]
  return unique.map((p) => ({ path: p, content: readFileSync(p, 'utf8') }))
}
