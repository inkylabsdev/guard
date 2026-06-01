import { describe, it, expect, vi, afterEach } from 'vitest'
import { versionCommand } from '../src/commands/version.js'

describe('versionCommand', () => {
  afterEach(() => vi.restoreAllMocks())

  it('prints package name and version', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    versionCommand()
    expect(spy).toHaveBeenCalledOnce()
    const output = spy.mock.calls[0][0] as string
    expect(output).toMatch(/^@inkylabs\/guard \d+\.\d+\.\d+$/)
  })
})
