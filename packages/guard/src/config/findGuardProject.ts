import { existsSync } from 'fs'
import { dirname, join } from 'path'

export type GuardProject =
  | { mode: 'single'; path: string }
  | { mode: 'package'; path: string }
  | { mode: 'conflict'; path: string }

export function findGuardProject(startDir: string): GuardProject | null {
  let dir = startDir
  while (true) {
    const hasGuard = existsSync(join(dir, 'GUARD.md'))
    const hasPackage = existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'src'))

    if (hasGuard && hasPackage) return { mode: 'conflict', path: dir }
    if (hasPackage) return { mode: 'package', path: dir }
    if (hasGuard) return { mode: 'single', path: join(dir, 'GUARD.md') }

    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}
