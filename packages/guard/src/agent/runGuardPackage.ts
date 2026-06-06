import { execa } from 'execa'
import { join, normalize } from 'path'
import type { Api, Model } from '@earendil-works/pi-ai'
import { buildTargetContent } from './buildPrompts.js'
import { filterAndDedupeFindings, hasInput, sortFindings } from './findings.js'
import { runGuardAgent } from './runGuardAgent.js'
import { summarizeTarget } from './summarizeTarget.js'
import type { GuardPackage, GuardRule, GuardTarget, PackageEvalResult, ResolvedGuardPolicy, RuleResult } from '../types.js'

const SCRIPT_REF = /`(scripts\/[^`]+)`/g

function targetInput(target: GuardTarget): string {
  return buildTargetContent(target)
}

function resolveScript(rule: GuardRule, ref: string): string {
  const scriptPath = normalize(join(rule.ruleDir, ref))
  const ruleDir = normalize(rule.ruleDir)
  if (scriptPath !== ruleDir && !scriptPath.startsWith(`${ruleDir}/`)) {
    throw new Error(`script escapes rule directory: ${ref}`)
  }
  return scriptPath
}

async function runHelperScripts(rule: GuardRule, target: GuardTarget): Promise<string> {
  const refs = [...new Set([...rule.body.matchAll(SCRIPT_REF)].map((match) => match[1]))]
  const output: string[] = []

  for (const ref of refs) {
    const scriptPath = resolveScript(rule, ref)
    const result = await execa(scriptPath, { input: targetInput(target), reject: false })
    if (result.failed) {
      throw new Error(`helper script failed: ${ref}`)
    }
    output.push(`=== Helper Script: ${ref} ===\n${result.stdout}`)
  }

  return output.join('\n\n')
}

function dependencyRuleContent(rule: GuardRule, rulesById: Map<string, GuardRule>): string {
  return rule.depends_on
    .map((id) => rulesById.get(id))
    .filter((dependency): dependency is GuardRule => Boolean(dependency))
    .map((dependency) => `=== Dependency Rule GUARD.md: ${dependency.id} ===\n${dependency.body}`)
    .join('\n\n')
}

function dependencyPackageContent(pkg: GuardPackage, packagesById: Map<string, GuardPackage>): string {
  return pkg.dependsOn
    .map((id) => packagesById.get(id))
    .filter((dependency): dependency is GuardPackage => Boolean(dependency?.guardContent))
    .map((dependency) => `=== Dependency Package GUARD.md: ${dependency.id} ===\n${dependency.guardContent}`)
    .join('\n\n')
}

function rulePolicy(
  pkg: GuardPackage,
  rule: GuardRule,
  helperOutput: string,
  packageContext: string,
  ruleContext: string,
): ResolvedGuardPolicy {
  const content = [
    pkg.guardContent ? `=== Package GUARD.md: ${pkg.id} ===\n${pkg.guardContent}` : '',
    packageContext,
    `# ${rule.description}`,
    `Rule id: ${rule.id}`,
    `Severity: ${rule.severity}`,
    ruleContext,
    rule.body,
    helperOutput,
  ].filter(Boolean).join('\n\n')

  return {
    policyPath: rule.guardPath,
    content,
    config: {
      severity_threshold: rule.severity,
      include: [],
      dependencies: [],
    },
  }
}

function aborted(rule: GuardRule): RuleResult {
  return {
    rule_id: rule.id,
    status: 'abort',
    findings: [],
    filtered_findings: 0,
    summary: 'Aborted because a dependency did not pass.',
  }
}

function errored(rule: GuardRule, err: unknown): RuleResult {
  return {
    rule_id: rule.id,
    status: 'error',
    findings: [],
    filtered_findings: 0,
    summary: String(err),
  }
}

function emptyRuleResult(rule: GuardRule): RuleResult {
  return {
    rule_id: rule.id,
    status: 'pass',
    findings: [],
    filtered_findings: 0,
    summary: 'No input to check.',
  }
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next
      next++
      results[index] = await fn(items[index])
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return results
}

function validatePackageGraph(packages: GuardPackage[]): void {
  const ids = new Set(packages.map((pkg) => pkg.id))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const byId = new Map(packages.map((pkg) => [pkg.id, pkg]))

  for (const pkg of packages) {
    for (const dependency of pkg.dependsOn) {
      if (!ids.has(dependency)) {
        throw new Error(`package "${pkg.id}" depends on missing package "${dependency}"`)
      }
    }
  }

  function visit(pkg: GuardPackage): void {
    if (visited.has(pkg.id)) return
    if (visiting.has(pkg.id)) throw new Error(`cycle detected at package "${pkg.id}"`)
    visiting.add(pkg.id)
    for (const dependency of [...pkg.dependsOn].sort()) {
      visit(byId.get(dependency)!)
    }
    visiting.delete(pkg.id)
    visited.add(pkg.id)
  }

  for (const pkg of [...packages].sort((a, b) => a.id.localeCompare(b.id))) {
    visit(pkg)
  }
}


async function runRule(
  pkg: GuardPackage,
  rule: GuardRule,
  target: GuardTarget,
  model: Model<Api>,
  targetSummary: string | undefined,
  packagesById: Map<string, GuardPackage>,
  rulesById: Map<string, GuardRule>,
): Promise<RuleResult> {
  try {
    const helperOutput = await runHelperScripts(rule, target)
    const result = await runGuardAgent(
      rulePolicy(
        pkg,
        rule,
        helperOutput,
        dependencyPackageContent(pkg, packagesById),
        dependencyRuleContent(rule, rulesById),
      ),
      target,
      model,
      targetSummary,
    )
    const scoredFindings = result.findings.map((finding) => ({
      ...finding,
      severity: rule.severity,
      rule: finding.rule ?? rule.id,
    }))
    const { retained, filtered } = filterAndDedupeFindings(scoredFindings)
    // Treat as fail when the LLM explicitly says passed:false with no findings to filter
    // (agent detected a violation but couldn't localise it). If findings were filtered,
    // the filtering rule takes precedence and the rule is pass.
    const failed = retained.length > 0 || (filtered === 0 && !result.passed)
    return {
      rule_id: rule.id,
      status: failed ? 'fail' : 'pass',
      findings: sortFindings(retained),
      filtered_findings: filtered,
      summary: retained.length === 0 && filtered > 0
        ? 'Only low-confidence findings were filtered.'
        : result.summary,
    }
  } catch (err) {
    return errored(rule, err)
  }
}

async function runRulesForPackage(
  pkg: GuardPackage,
  target: GuardTarget,
  model: Model<Api>,
  targetSummary: string | undefined,
  concurrency: number,
  packagesById: Map<string, GuardPackage>,
): Promise<RuleResult[]> {
  const results = new Map<string, RuleResult>()
  const rulesById = new Map(pkg.rules.map((rule) => [rule.id, rule]))

  while (results.size < pkg.rules.length) {
    const pending = pkg.rules.filter((rule) => !results.has(rule.id))
    const abortedRules = pending.filter((rule) =>
      rule.depends_on.some((dependency) => {
        const result = results.get(dependency)
        /* c8 ignore next */
        return result?.status === 'fail' || result?.status === 'error' || result?.status === 'abort'
      }))
    for (const rule of abortedRules) {
      results.set(rule.id, aborted(rule))
    }

    const ready = pending
      .filter((rule) => !results.has(rule.id))
      .filter((rule) => rule.depends_on.every((dependency) =>
        /* c8 ignore next */
        results.get(dependency)?.status === 'pass'))
      .sort((a, b) => a.id.localeCompare(b.id))

    if (ready.length === 0) break

    const ruleResults = hasInput(target)
      ? await mapConcurrent(ready, concurrency, (rule) =>
        runRule(pkg, rule, target, model, targetSummary, packagesById, rulesById))
      : ready.map(emptyRuleResult)

    for (const result of ruleResults) {
      results.set(result.rule_id, result)
    }
  }

  return pkg.rules.map((rule) =>
    /* c8 ignore next */
    results.get(rule.id) ?? aborted(rule))
}

export async function runGuardPackage(
  guardPackage: GuardPackage | GuardPackage[],
  target: GuardTarget,
  concurrency: number,
  model: Model<Api>,
): Promise<PackageEvalResult> {
  const packages = Array.isArray(guardPackage) ? guardPackage : [guardPackage]
  validatePackageGraph(packages)
  const packagesById = new Map(packages.map((pkg) => [pkg.id, pkg]))

  let targetSummary: string | undefined
  if (hasInput(target)) {
    try {
      targetSummary = await summarizeTarget(target, model)
    } catch (err) {
      process.stderr.write(`warning: target summarization failed: ${String(err)}\n`)
    }
  }

  const packageResults = new Map<string, RuleResult[]>()

  while (packageResults.size < packages.length) {
    const pending = packages.filter((pkg) => !packageResults.has(pkg.id))
    const abortedPackages = pending.filter((pkg) =>
      pkg.dependsOn.some((dependency) =>
        packageResults.get(dependency)?.some((result) =>
          result.status === 'fail' || result.status === 'error' || result.status === 'abort')))

    for (const pkg of abortedPackages) {
      packageResults.set(pkg.id, pkg.rules.map(aborted))
    }

    const ready = pending
      .filter((pkg) => !packageResults.has(pkg.id))
      .filter((pkg) => pkg.dependsOn.every((dependency) =>
        packageResults.get(dependency)?.every((result) => result.status === 'pass')))
      .sort((a, b) => a.id.localeCompare(b.id))

    if (ready.length === 0) break

    const readyResults = await mapConcurrent(ready, concurrency, (pkg) =>
      runRulesForPackage(pkg, target, model, targetSummary, concurrency, packagesById))

    for (let i = 0; i < ready.length; i++) {
      packageResults.set(ready[i].id, readyResults[i])
    }
  }

  const orderedRuleResults = [...packages]
    .sort((a, b) => a.id.localeCompare(b.id))
    .flatMap((pkg) =>
      /* c8 ignore next */
      packageResults.get(pkg.id) ?? pkg.rules.map(aborted))
  const findings = orderedRuleResults.flatMap((result) => result.findings)
  const errors = orderedRuleResults.filter((result) => result.status === 'error').length
  const failures = orderedRuleResults.filter((result) => result.status === 'fail').length

  return {
    summary: !hasInput(target)
      ? 'No input to check.'
      : errors > 0
        ? `${errors} rule error(s).`
        : failures > 0
          ? `${failures} rule failure(s).`
          : 'All package rules passed or aborted.',
    findings,
    passed: errors === 0 && findings.length === 0,
    ruleResults: orderedRuleResults,
  }
}
