import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { parseGuardFile } from '../src/config/parseGuardFile.js'

describe('parseGuardFile', () => {
  let dir: string

  beforeEach(() => {
    dir = join(tmpdir(), `guard-test-${Date.now()}`)
    mkdirSync(dir)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns defaults when frontmatter is empty', () => {
    const file = join(dir, 'GUARD.md')
    writeFileSync(file, '# Policy\n\n- Be good.')
    const { config, body } = parseGuardFile(file)
    expect(config.severity_threshold).toBe('info')
    expect(config.include).toEqual([])
    expect(body).toBe('# Policy\n\n- Be good.')
  })

  it('parses frontmatter overrides', () => {
    const file = join(dir, 'GUARD.md')
    writeFileSync(file, `---
severity_threshold: error
---
# Policy`)
    const { config } = parseGuardFile(file)
    expect(config.severity_threshold).toBe('error')
  })

  it('parses include array', () => {
    const file = join(dir, 'GUARD.md')
    writeFileSync(file, `---
include:
  - github:inkylabs/guard-rules/javascript
  - github: inkylabs/guard-rules/security
    ref: main
---
Body`)
    const { config } = parseGuardFile(file)
    expect(config.include[0]).toBe('github:inkylabs/guard-rules/javascript')
  })
})
