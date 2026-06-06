import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { findGuardProject } from '../src/config/findGuardProject.js'
import { loadGuardPackage, loadGuardPackageGraph, orderGuardRules } from '../src/config/loadGuardPackage.js'
import type { GuardRule } from '../src/types.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixtureRoot = resolve(here, 'fixtures/simple-writing-guard')
const simpleWritingGuardRoot = resolve(here, '../../../guards/simple-writing-guard')

function writeRule(root: string, id: string, frontmatter: Record<string, unknown> = {}): void {
  const ruleDir = join(root, 'src', id)
  mkdirSync(ruleDir, { recursive: true })
  const data = {
    id,
    severity: 'warning',
    description: id,
    depends_on: [],
    ...frontmatter,
  }
  writeFileSync(join(ruleDir, 'GUARD.md'), `---
id: ${data.id}
severity: ${data.severity}
description: ${data.description}
depends_on: ${JSON.stringify(data.depends_on)}
---
Body`)
}

describe('findGuardProject', () => {
  let dir: string

  beforeEach(() => {
    dir = join(tmpdir(), `guard-project-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('finds single-policy mode', () => {
    writeFileSync(join(dir, 'GUARD.md'), '# Policy')
    expect(findGuardProject(dir)).toEqual({ mode: 'single', path: join(dir, 'GUARD.md') })
  })

  it('finds package mode', () => {
    writeFileSync(join(dir, 'package.json'), '{}')
    mkdirSync(join(dir, 'src'))
    expect(findGuardProject(dir)).toEqual({ mode: 'package', path: dir })
  })

  it('finds conflicting formats', () => {
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, 'GUARD.md'), '# Policy')
    mkdirSync(join(dir, 'src'))
    expect(findGuardProject(dir)).toEqual({ mode: 'conflict', path: dir })
  })

  it('returns null when no format is found', () => {
    expect(findGuardProject(dir)).toBeNull()
  })
})

describe('loadGuardPackage', () => {
  let dir: string

  beforeEach(() => {
    dir = join(tmpdir(), `guard-package-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    mkdirSync(join(dir, 'src'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('loads and orders the simple-writing-guard fixture package', () => {
    const pkg = loadGuardPackage(fixtureRoot)
    expect(pkg.id).toBe('@fixtures/simple-writing-guard')
    expect(pkg.dependsOn).toEqual([])
    expect(pkg.rules.map((rule) => rule.id)).toEqual([
      'no-em-dash',
      'no-contrast-cliche',
      'no-tier-one-ai-words',
    ])
    expect(pkg.rules[0].body).toContain('## Rule')
  })

  it('loads the simple-writing-guard package with category eval samples', () => {
    const pkg = loadGuardPackage(simpleWritingGuardRoot)
    expect(pkg.id).toBe('@guards/simple-writing-guard')
    expect(pkg.rules.map((rule) => rule.id)).toEqual([
      'ai-vocabulary',
      'boilerplate-phrases',
      'chatbot-and-source-artifacts',
      'formatting',
      'sentence-structure',
      'social-and-marketing',
      'structure-and-rhythm',
      'transitions-and-fillers',
    ])

    for (const rule of pkg.rules) {
      expect(existsSync(join(rule.ruleDir, 'evals/bad/sample.md'))).toBe(true)
      expect(existsSync(join(rule.ruleDir, 'evals/good/sample.md'))).toBe(true)
    }
  })

  it('rejects packages without a manifest', () => {
    rmSync(join(dir, 'package.json'))
    expect(() => loadGuardPackage(dir)).toThrow('package.json')
  })

  it('rejects packages without src', () => {
    rmSync(join(dir, 'src'), { recursive: true })
    expect(() => loadGuardPackage(dir)).toThrow('src/')
  })

  it('loads package guard dependencies and root GUARD.md context', () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'demo',
      guard: { dependsOn: ['base'] },
    }))
    writeFileSync(join(dir, 'GUARD.md'), '# Root package guidance')
    writeRule(dir, 'a')

    const pkg = loadGuardPackage(dir)

    expect(pkg.id).toBe('demo')
    expect(pkg.dependsOn).toEqual(['base'])
    expect(pkg.guardPath).toBe(join(dir, 'GUARD.md'))
    expect(pkg.guardContent).toBe('# Root package guidance')
  })

  it('loads installed package dependencies into a package graph', () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'root',
      guard: { dependsOn: ['base', 'base'] },
    }))
    writeRule(dir, 'root-rule')
    const baseDir = join(dir, '.guard_modules', 'base')
    mkdirSync(join(baseDir, 'src'), { recursive: true })
    writeFileSync(join(baseDir, 'package.json'), JSON.stringify({ name: 'base' }))
    writeRule(baseDir, 'base-rule')

    const packages = loadGuardPackageGraph(dir)

    expect(packages.map((pkg) => pkg.id)).toEqual(['root', 'base'])
  })

  it('rejects missing installed package dependencies', () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'root',
      guard: { dependsOn: ['base'] },
    }))
    writeRule(dir, 'root-rule')

    expect(() => loadGuardPackageGraph(dir)).toThrow('dependency package is not installed: base')
  })

  it('rejects installed package dependency id mismatches', () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'root',
      guard: { dependsOn: ['base'] },
    }))
    writeRule(dir, 'root-rule')
    const baseDir = join(dir, '.guard_modules', 'base')
    mkdirSync(join(baseDir, 'src'), { recursive: true })
    writeFileSync(join(baseDir, 'package.json'), JSON.stringify({ name: 'different' }))
    writeRule(baseDir, 'base-rule')

    expect(() => loadGuardPackageGraph(dir)).toThrow('package id mismatch')
  })

  it('rejects a rule directory without GUARD.md', () => {
    mkdirSync(join(dir, 'src', 'missing'), { recursive: true })
    expect(() => loadGuardPackage(dir)).toThrow('missing GUARD.md')
  })

  it('rejects id mismatches', () => {
    writeRule(dir, 'expected', { id: 'actual' })
    expect(() => loadGuardPackage(dir)).toThrow('does not match directory')
  })

  it('rejects duplicate ids', () => {
    writeRule(dir, 'one', { id: 'same' })
    writeRule(dir, 'two', { id: 'same' })
    expect(() => loadGuardPackage(dir)).toThrow('duplicate rule id')
  })

  it('rejects missing dependencies', () => {
    writeRule(dir, 'child', { depends_on: ['missing'] })
    expect(() => loadGuardPackage(dir)).toThrow('depends on missing rule')
  })

  it('rejects cycles', () => {
    writeRule(dir, 'a', { depends_on: ['b'] })
    writeRule(dir, 'b', { depends_on: ['a'] })
    expect(() => loadGuardPackage(dir)).toThrow('cycle detected')
  })

  it('rejects missing dependencies during ordering', () => {
    const rule: GuardRule = {
      id: 'child',
      severity: 'warning',
      description: 'child',
      depends_on: ['missing'],
      body: 'Body',
      ruleDir: join(dir, 'src', 'child'),
      guardPath: join(dir, 'src', 'child', 'GUARD.md'),
    }
    expect(() => orderGuardRules([rule])).toThrow('depends on missing rule')
  })
})
