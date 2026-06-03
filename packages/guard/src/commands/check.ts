import { dirname } from 'path'
import { findGuardFile } from '../config/findGuardFile.js'
import { parseGuardFile } from '../config/parseGuardFile.js'
import { resolveLinkedFiles } from '../config/resolveLinkedFiles.js'
import { resolveIncludes } from '../config/resolveIncludes.js'
import { collectTargets } from '../input/collectTargets.js'
import { runGuardAgent } from '../agent/runGuardAgent.js'
import { createModel } from '../providers/createModel.js'
import { formatReport } from '../report/formatReport.js'
import { computeExitCode } from '../report/exitCode.js'
import type { ResolvedGuardPolicy } from '../types.js'

export type CheckCommandOptions = {
  diff?: boolean
  stdin?: boolean
  args: string[]
}

export async function checkCommand(opts: CheckCommandOptions): Promise<void> {
  const cwd = process.cwd()

  if (!opts.diff && !opts.stdin && opts.args.length === 0) {
    process.stderr.write('error: no input specified. Use --diff, --stdin, or provide paths.\n')
    process.exit(2)
  }

  const guardPath = findGuardFile(cwd)
  if (!guardPath) {
    process.stderr.write('error: no GUARD.md found (searched upward from cwd)\n')
    process.exit(2)
  }

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

  const target = await collectTargets({ ...opts, cwd })
  const handle = createModel(config)
  try {
    const result = await runGuardAgent(policy, target, config, handle.model)
    console.log(formatReport(result, target, guardPath))

    const code = computeExitCode(result.findings, config.severity_threshold)
    process.exit(code)
  } finally {
    handle.cleanup()
  }
}
