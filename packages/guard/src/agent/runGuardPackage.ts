import { execa } from 'execa'
import { join, normalize } from 'path'
import type { Api, Model } from '@earendil-works/pi-ai'
import { buildTargetContent } from './buildPrompts.js'
import { runGuardAgent } from './runGuardAgent.js'
import type { GuardPackage, GuardRule, GuardTarget, PackageEvalResult, ResolvedGuardPolicy, RuleResult, RuntimeConfig } from '../types.js'

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

function rulePolicy(rule: GuardRule, helperOutput: string): ResolvedGuardPolicy {
  const content = [
    `# ${rule.description}`,
    `Rule id: ${rule.id}`,
    `Severity: ${rule.severity}`,
    rule.body,
    helperOutput,
  ].filter(Boolean).join('\n\n')

  return {
    policyPath: rule.guardPath,
    content,
    config: {
      severity_threshold: rule.severity,
      include: [],
    },
  }
}

function aborted(rule: GuardRule): RuleResult {
  return {
    rule_id: rule.id,
    status: 'abort',
    findings: [],
    summary: 'Aborted because a dependency did not pass.',
  }
}

function errored(rule: GuardRule, err: unknown): RuleResult {
  return {
    rule_id: rule.id,
    status: 'error',
    findings: [],
    summary: String(err),
  }
}

export async function runGuardPackage(
  guardPackage: GuardPackage,
  target: GuardTarget,
  runtime: RuntimeConfig,
  model: Model<Api>,
): Promise<PackageEvalResult> {
  const results: RuleResult[] = []

  for (const rule of guardPackage.rules) {
    const dependencies = results.filter((result) => rule.depends_on.includes(result.rule_id))
    if (dependencies.some((result) => result.status !== 'pass')) {
      results.push(aborted(rule))
      continue
    }

    try {
      const helperOutput = await runHelperScripts(rule, target)
      const result = await runGuardAgent(rulePolicy(rule, helperOutput), target, runtime, model)
      const findings = result.findings.map((finding) => ({
        ...finding,
        severity: rule.severity,
        rule: finding.rule ?? rule.id,
      }))

      results.push({
        rule_id: rule.id,
        status: findings.length > 0 ? 'fail' : 'pass',
        findings,
        summary: result.summary,
      })
    } catch (err) {
      results.push(errored(rule, err))
    }
  }

  const findings = results.flatMap((result) => result.findings)
  const errors = results.filter((result) => result.status === 'error').length
  const failures = results.filter((result) => result.status === 'fail').length

  return {
    summary: errors > 0
      ? `${errors} rule error(s).`
      : failures > 0
        ? `${failures} rule failure(s).`
        : 'All package rules passed or aborted.',
    findings,
    passed: errors === 0 && findings.length === 0,
    ruleResults: results,
  }
}
