import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'

const AT_REF = /@([\w./\-]+\.md)/g

export function resolveLinkedFiles(
  body: string,
  guardDir: string,
  visited = new Set<string>(),
): string {
  let extra = ''
  for (const match of body.matchAll(AT_REF)) {
    const refPath = join(guardDir, match[1])
    if (visited.has(refPath)) continue
    visited.add(refPath)
    if (!existsSync(refPath)) {
      process.stderr.write(`warn: linked file not found: ${refPath}\n`)
      continue
    }
    const content = readFileSync(refPath, 'utf8')
    extra += `\n\n<!-- linked: ${match[1]} -->\n${content}`
    extra += resolveLinkedFiles(content, dirname(refPath), visited)
  }
  return extra
}
