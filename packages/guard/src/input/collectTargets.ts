import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { collectFiles } from './collectFiles.js'
import { collectDiff } from './collectDiff.js'
import { collectStdin } from './collectStdin.js'
import type { GuardTarget } from '../types.js'

export type CheckOptions = {
  diff?: boolean
  stdin?: boolean
  args: string[]
  cwd: string
}

export async function collectTargets(opts: CheckOptions): Promise<GuardTarget> {
  if (opts.diff) return collectDiff(opts.cwd)
  if (opts.stdin) return collectStdin()

  const patterns: string[] = []
  for (const arg of opts.args) {
    if (arg.startsWith('@')) {
      patterns.push(...expandFileList(arg.slice(1), opts.cwd))
    } else {
      patterns.push(arg)
    }
  }

  const files = await collectFiles(patterns, opts.cwd)
  return { mode: 'files', files }
}

function expandFileList(listPath: string, cwd: string): string[] {
  const abs = resolve(cwd, listPath)
  if (!existsSync(abs)) {
    process.stderr.write(`warn: file list not found: ${abs}\n`)
    return []
  }
  return readFileSync(abs, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
}
