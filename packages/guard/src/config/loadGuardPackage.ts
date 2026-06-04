import { existsSync, readdirSync, statSync } from 'fs'
import { basename, join } from 'path'
import { parseGuardRuleFile } from './parseGuardRuleFile.js'
import type { GuardPackage, GuardRule } from '../types.js'

function compareRule(a: GuardRule, b: GuardRule): number {
  return a.id.localeCompare(b.id)
}

function ruleDirs(rootDir: string): string[] {
  const srcDir = join(rootDir, 'src')
  if (!existsSync(srcDir)) {
    throw new Error('guard package is missing src/')
  }

  return readdirSync(srcDir)
    .map((name) => join(srcDir, name))
    .filter((path) => statSync(path).isDirectory())
    .sort()
}

function validateRules(rules: GuardRule[]): void {
  const ids = new Set<string>()

  for (const rule of rules) {
    if (ids.has(rule.id)) {
      throw new Error(`duplicate rule id: ${rule.id}`)
    }
    ids.add(rule.id)
  }

  for (const rule of rules) {
    const dirId = basename(rule.ruleDir)
    if (rule.id !== dirId) {
      throw new Error(`rule id "${rule.id}" does not match directory "${dirId}"`)
    }
  }

  for (const rule of rules) {
    for (const dep of rule.depends_on) {
      if (!ids.has(dep)) {
        throw new Error(`rule "${rule.id}" depends on missing rule "${dep}"`)
      }
    }
  }
}

export function orderGuardRules(rules: GuardRule[]): GuardRule[] {
  const byId = new Map(rules.map((rule) => [rule.id, rule]))
  const ordered: GuardRule[] = []
  const temporary = new Set<string>()
  const permanent = new Set<string>()

  function visit(rule: GuardRule): void {
    if (permanent.has(rule.id)) return
    if (temporary.has(rule.id)) {
      throw new Error(`cycle detected at rule "${rule.id}"`)
    }

    temporary.add(rule.id)
    for (const dep of [...rule.depends_on].sort()) {
      const depRule = byId.get(dep)
      if (!depRule) {
        throw new Error(`rule "${rule.id}" depends on missing rule "${dep}"`)
      }
      visit(depRule)
    }
    temporary.delete(rule.id)
    permanent.add(rule.id)
    ordered.push(rule)
  }

  for (const rule of [...rules].sort(compareRule)) {
    visit(rule)
  }

  return ordered
}

export function loadGuardPackage(rootDir: string): GuardPackage {
  const manifestPath = join(rootDir, 'package.json')
  if (!existsSync(manifestPath)) {
    throw new Error('guard package is missing package.json')
  }

  const rules = ruleDirs(rootDir).map((ruleDir) => {
    const guardPath = join(ruleDir, 'GUARD.md')
    if (!existsSync(guardPath)) {
      throw new Error(`rule directory is missing GUARD.md: ${ruleDir}`)
    }

    return {
      ...parseGuardRuleFile(guardPath),
      ruleDir,
      guardPath,
    }
  })

  validateRules(rules)

  return {
    rootDir,
    manifestPath,
    rules: orderGuardRules(rules),
  }
}
