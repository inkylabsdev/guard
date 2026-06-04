import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { parseGuardRuleFile } from '../src/config/parseGuardRuleFile.js'

describe('parseGuardRuleFile', () => {
  let dir: string

  beforeEach(() => {
    dir = join(tmpdir(), `guard-rule-${Date.now()}`)
    mkdirSync(dir)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('parses rule frontmatter and body', () => {
    const file = join(dir, 'GUARD.md')
    writeFileSync(file, `---
id: no-em-dash
severity: warning
description: Avoid em dashes
depends_on: [base-rule]
---

## Rule

No em dashes.`)

    expect(parseGuardRuleFile(file)).toEqual({
      id: 'no-em-dash',
      severity: 'warning',
      description: 'Avoid em dashes',
      depends_on: ['base-rule'],
      body: '## Rule\n\nNo em dashes.',
    })
  })

  it('defaults depends_on to an empty array', () => {
    const file = join(dir, 'GUARD.md')
    writeFileSync(file, `---
id: direct-language
severity: info
description: Use direct language
---
Body`)

    expect(parseGuardRuleFile(file).depends_on).toEqual([])
  })

  it('rejects invalid depends_on ids', () => {
    const file = join(dir, 'GUARD.md')
    writeFileSync(file, `---
id: direct-language
severity: info
description: Use direct language
depends_on: ["../other"]
---
Body`)

    expect(() => parseGuardRuleFile(file)).toThrow()
  })
})
