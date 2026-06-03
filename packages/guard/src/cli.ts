#!/usr/bin/env node
import { cac } from 'cac'
import { versionCommand } from './commands/version.js'
import { checkCommand } from './commands/check.js'

const cli = cac('guard')

cli
  .command('version', 'Print the current version')
  .action(() => versionCommand())

cli
  .command('check [...args]', 'Check input against GUARD.md policy')
  .option('--diff', 'Check files in current git diff')
  .option('--stdin', 'Read input from stdin')
  .option('--provider <provider>', 'AI provider to use: openai, anthropic (default: mock or $GUARD_PROVIDER)')
  .option('--model <model>', 'Model ID to use (default: mock or $GUARD_MODEL)')
  .option('--max-iterations <n>', 'Maximum agent iterations (default: 3)', { default: 3 })
  .action((args: string[], opts: { diff?: boolean; stdin?: boolean; provider?: string; model?: string; maxIterations?: number }) => {
    checkCommand({ diff: opts.diff, stdin: opts.stdin, args, provider: opts.provider, model: opts.model, maxIterations: opts.maxIterations }).catch((err) => {
      process.stderr.write(`error: ${String(err)}\n`)
      process.exit(2)
    })
  })

cli.help()
cli.parse()
