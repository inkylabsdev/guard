import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

export function versionCommand(): void {
  const require = createRequire(import.meta.url)
  const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '../../package.json')
  const pkg = require(pkgPath) as { name: string; version: string }
  console.log(`${pkg.name} ${pkg.version}`)
}
