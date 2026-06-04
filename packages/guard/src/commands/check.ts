import { dirname } from 'path'
import { findGuardProject } from '../config/findGuardProject.js'
import { loadGuardPackage } from '../config/loadGuardPackage.js'
import { parseGuardFile } from '../config/parseGuardFile.js'
import { resolveLinkedFiles } from '../config/resolveLinkedFiles.js'
import { resolveIncludes } from '../config/resolveIncludes.js'
import { collectTargets } from '../input/collectTargets.js'
import { runGuardAgent } from '../agent/runGuardAgent.js'
import { runGuardPackage } from '../agent/runGuardPackage.js'
import { createModel } from '../providers/createModel.js'
import { formatPackageReport, formatReport } from '../report/formatReport.js'
import { computeExitCode, computePackageExitCode } from '../report/exitCode.js'
import type { GuardPackage, ResolvedGuardPolicy, RuntimeConfig } from '../types.js'

export type CheckCommandOptions = {
  diff?: boolean
  stdin?: boolean
  args: string[]
  provider?: string
  model?: string
  maxIterations?: number
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
  if (project.mode === 'package') {
    try {
      guardPackage = loadGuardPackage(project.path)
    } catch (err) {
      process.stderr.write(`error: ${String(err)}\n`)
      process.exit(2)
    }
  }

  const rawProvider = opts.provider ?? process.env['GUARD_PROVIDER'] ?? 'mock'
  const runtime: RuntimeConfig = {
    provider: rawProvider as RuntimeConfig['provider'],
    model: opts.model ?? process.env['GUARD_MODEL'] ?? 'mock',
    max_iterations: opts.maxIterations ?? 3,
  }

  const target = await collectTargets({ ...opts, cwd })
  const handle = createModel(runtime)
  try {
    if (project.mode === 'single') {
      const guardPath = project.path
      const { config, body } = parseGuardFile(guardPath)
      const guardDir = dirname(guardPath)

      const linkedContent = resolveLinkedFiles(body, guardDir)
      const includeContent = await resolveIncludes(config.include)
      const fullContent = [body, linkedContent, includeContent].filter(Boolean).join('\n\n')

      const policy: ResolvedGuardPolicy = {
        policyPath: guardPath,
        content: fullContent,
        config,
      }

      const result = await runGuardAgent(policy, target, runtime, handle.model)
      console.log(formatReport(result, target, guardPath))

      const code = computeExitCode(result.findings, config.severity_threshold)
      process.exit(code)
    }

    const result = await runGuardPackage(guardPackage!, target, runtime, handle.model)
    console.log(formatPackageReport(result, target, guardPackage!.manifestPath))
    process.exit(computePackageExitCode(result, 'info'))
  } finally {
    handle.cleanup()
  }
}
