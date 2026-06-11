import { dirname } from 'path'
import { findGuardProject } from '../config/findGuardProject.js'
import { loadGuardPackageGraph } from '../config/loadGuardPackage.js'
import { parseGuardFile } from '../config/parseGuardFile.js'
import { installDependencies } from '../config/registry.js'
import { resolveLinkedFiles } from '../config/resolveLinkedFiles.js'
import { resolveIncludes } from '../config/resolveIncludes.js'
import { collectTargets } from '../input/collectTargets.js'
import { runGuardAgent } from '../agent/runGuardAgent.js'
import { runGuardPackage } from '../agent/runGuardPackage.js'
import { filterAndDedupeFindings, hasInput, sortFindings } from '../agent/findings.js'
import { summarizeTarget } from '../agent/summarizeTarget.js'
import { createModel } from '../providers/createModel.js'
import { formatPackageReport, formatReport } from '../report/formatReport.js'
import { computeExitCode, computePackageExitCode } from '../report/exitCode.js'
import type { GuardEvalResult, GuardPackage, ResolvedGuardPolicy, RuntimeConfig } from '../types.js'

export type CheckCommandOptions = {
  diff?: boolean
  stdin?: boolean
  args: string[]
  provider?: string
  model?: string
  maxIterations?: number | string
}

function parsePositiveInt(value: string | undefined, name: string): number {
  if (value === undefined) return 4
  const parsed = parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0 || String(parsed) !== value) {
    throw new Error(`${name} must be a positive integer`)
  }
  return parsed
}

function parseConcurrency(): number {
  try {
    return parsePositiveInt(process.env['GUARD_AGENT_CONCURRENCY'], 'GUARD_AGENT_CONCURRENCY')
  } catch (err) {
    process.stderr.write(`error: ${String(err)}\n`)
    process.exit(2)
  }
}

function skippedResult(): GuardEvalResult {
  return {
    summary: 'No input to check.',
    findings: [],
    passed: true,
  }
}

export async function checkCommand(opts: CheckCommandOptions): Promise<void> {
  const cwd = process.cwd()

  if (!opts.diff && !opts.stdin && opts.args.length === 0) {
    process.stderr.write('error: no input specified. Use --diff, --stdin, or provide paths.\n')
    process.exit(2)
  }

  const project = findGuardProject(cwd)
  if (!project) {
    process.stderr.write('error: no guard project found (searched upward from cwd)\n')
    process.exit(2)
  }

  if (project.mode === 'conflict') {
    process.stderr.write(`error: guard project cannot contain both GUARD.md and package.json + src/: ${project.path}\n`)
    process.exit(2)
  }

  let guardPackage: GuardPackage | undefined
  let guardPackages: GuardPackage[] | undefined
  if (project.mode === 'package') {
    try {
      guardPackages = loadGuardPackageGraph(project.path)
      guardPackage = guardPackages[0]
    } catch (err) {
      process.stderr.write(`error: ${String(err)}\n`)
      process.exit(2)
    }
  }

  const rawProvider = opts.provider ?? process.env['GUARD_PROVIDER'] ?? 'faux'
  const concurrency = parseConcurrency()

  const runtime: RuntimeConfig = {
    provider: rawProvider as RuntimeConfig['provider'],
    model: opts.model ?? process.env['GUARD_MODEL'] ?? 'faux',
    concurrency,
  }

  if (project.mode === 'single') {
    const guardPath = project.path
    const { config, body } = parseGuardFile(guardPath)
    const guardDir = dirname(guardPath)

    try {
      await installDependencies(guardDir, config.dependencies)
    } catch (err) {
      process.stderr.write(`error: ${String(err)}\n`)
      process.exit(2)
    }

    const linkedContent = resolveLinkedFiles(body, guardDir)
    const includeContent = await resolveIncludes(config.include, guardDir)
    const fullContent = [body, linkedContent, includeContent].filter(Boolean).join('\n\n')
    const target = await collectTargets({ ...opts, cwd })
    if (!hasInput(target)) {
      console.log(formatReport(skippedResult(), target, guardPath))
      process.exit(0)
    }

    const handle = createModel(runtime)
    try {
      const policy: ResolvedGuardPolicy = {
        policyPath: guardPath,
        content: fullContent,
        config,
      }

      let targetSummary: string | undefined
      try {
        targetSummary = await summarizeTarget(target, handle.model)
      /* c8 ignore next 3 */
      } catch (err) {
        process.stderr.write(`warning: target summarization failed: ${String(err)}\n`)
      }

      const rawResult = await runGuardAgent(policy, target, handle.model, targetSummary)
      const { retained } = filterAndDedupeFindings(rawResult.findings)
      const result = {
        ...rawResult,
        findings: sortFindings(retained),
        passed: retained.length === 0,
      }
      console.log(formatReport(result, target, guardPath))

      const code = computeExitCode(result.findings, config.severity_threshold)
      process.exit(code)
    } finally {
      handle.cleanup()
    }
  }

  const target = await collectTargets({ ...opts, cwd })
  if (opts.maxIterations !== undefined) {
    process.stderr.write('warning: --max-iterations is deprecated and ignored in package mode\n')
  }
  const handle = createModel(runtime)
  try {
    const result = await runGuardPackage(guardPackages!, target, runtime.concurrency, handle.model)
    console.log(formatPackageReport(result, target, guardPackage!.manifestPath))
    process.exit(computePackageExitCode(result, 'info'))
  } finally {
    handle.cleanup()
  }
}
