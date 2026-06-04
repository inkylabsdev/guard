import { dirname } from 'path'
import { findGuardProject } from '../config/findGuardProject.js'
import { parseGuardFile } from '../config/parseGuardFile.js'
import { installDependencies } from '../config/registry.js'

export type InstallCommandOptions = {
  args: string[]
}

export async function installCommand(opts: InstallCommandOptions): Promise<void> {
  const cwd = process.cwd()
  const project = findGuardProject(cwd)
  if (!project) {
    process.stderr.write('error: no guard project found (searched upward from cwd)\n')
    process.exit(2)
  }

  if (project.mode !== 'single') {
    process.stderr.write('error: guard install requires a project root GUARD.md\n')
    process.exit(2)
  }

  const projectRoot = dirname(project.path)
  const dependencies = opts.args.length > 0 ? opts.args : parseGuardFile(project.path).config.dependencies
  if (dependencies.length === 0) {
    process.stderr.write('error: no dependencies specified\n')
    process.exit(2)
  }

  await installDependencies(projectRoot, dependencies)
}
