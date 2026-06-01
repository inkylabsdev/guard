import { existsSync } from 'fs'
import { join, dirname } from 'path'

export function findGuardFile(startDir: string): string | null {
  let dir = startDir
  while (true) {
    const candidate = join(dir, 'GUARD.md')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}
