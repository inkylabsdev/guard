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
  .action((args: string[], opts: { diff?: boolean; stdin?: boolean }) => {
    checkCommand({ diff: opts.diff, stdin: opts.stdin, args }).catch((err) => {
      process.stderr.write(`error: ${String(err)}\n`)
      process.exit(2)
    })
  })

cli.help()
cli.parse()
