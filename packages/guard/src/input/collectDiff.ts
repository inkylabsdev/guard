import { execa } from 'execa'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { GuardTarget, GuardFile } from '../types.js'

export async function collectDiff(cwd: string): Promise<GuardTarget> {
  const repoRoot = await gitRepoRoot(cwd)

  const [unstagedNames, stagedNames, unstagedDiff, stagedDiff] = await Promise.all([
    gitLines(cwd, ['diff', '--name-only']),
    gitLines(cwd, ['diff', '--cached', '--name-only']),
    gitText(cwd, ['diff']),
    gitText(cwd, ['diff', '--cached']),
  ])

  const paths = [...new Set([...unstagedNames, ...stagedNames])].filter(Boolean)
  const files: GuardFile[] = paths
    .map((p) => (repoRoot ? join(repoRoot, p) : p))
    .filter((p) => existsSync(p))
    .map((p) => ({ path: p, content: readFileSync(p, 'utf8') }))

  return {
    mode: 'diff',
    files,
    raw: [unstagedDiff, stagedDiff].filter(Boolean).join('\n'),
  }
}

async function gitRepoRoot(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execa('git', ['rev-parse', '--show-toplevel'], { cwd })
    return stdout.trim()
  } catch {
    return null
  }
}

async function gitLines(cwd: string, args: string[]): Promise<string[]> {
  try {
    const { stdout } = await execa('git', args, { cwd })
    return stdout.split('\n').map((l) => l.trim()).filter(Boolean)
  } catch {
    return []
  }
}

async function gitText(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execa('git', args, { cwd })
    return stdout
  } catch {
    return ''
  }
}
