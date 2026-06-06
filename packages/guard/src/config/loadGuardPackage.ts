import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { basename, join } from 'path'
import { z } from 'zod'
import { parseGuardRuleFile } from './parseGuardRuleFile.js'
import type { GuardPackage, GuardRule } from '../types.js'

const PackageManifestSchema = z.object({
  name: z.string().optional(),
  guard: z.object({
    dependsOn: z.array(z.string()).optional(),
  }).optional(),
})

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
  const manifest = PackageManifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')))
  const guardMdPath = join(rootDir, 'GUARD.md')
  const guardMdExists = existsSync(guardMdPath)

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
    id: manifest.name ?? basename(rootDir),
    rootDir,
    manifestPath,
    guardPath: guardMdExists ? guardMdPath : undefined,
    guardContent: guardMdExists ? readFileSync(guardMdPath, 'utf8') : undefined,
    dependsOn: manifest.guard?.dependsOn ?? [],
    rules: orderGuardRules(rules),
  }
}

export function loadGuardPackageGraph(rootDir: string): GuardPackage[] {
  const rootPackage = loadGuardPackage(rootDir)
  const packages = new Map<string, GuardPackage>([[rootPackage.id, rootPackage]])
  const queue = [...rootPackage.dependsOn]

  while (queue.length > 0) {
    const packageId = queue.shift()!
    if (packages.has(packageId)) continue

    const packageDir = join(rootDir, '.guard_modules', packageId)
    if (!existsSync(packageDir)) {
      throw new Error(`dependency package is not installed: ${packageId}`)
    }

    const dependencyPackage = loadGuardPackage(packageDir)
    if (dependencyPackage.id !== packageId) {
      throw new Error(
        `package id mismatch: "${packageId}" in dependsOn but package.json declares name "${dependencyPackage.id}"; ` +
        `set "name": "${packageId}" in ${packageDir}/package.json or update dependsOn to use "${dependencyPackage.id}"`,
      )
    }
    packages.set(packageId, dependencyPackage)
    queue.push(...dependencyPackage.dependsOn)
  }

  return [...packages.values()]
}
