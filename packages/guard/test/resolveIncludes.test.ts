import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveIncludes } from '../src/config/resolveIncludes.js'

function mockFetch(text: string, ok = true) {
  return vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 404,
    text: async () => text,
  }))
}

describe('resolveIncludes', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns empty string when no includes', async () => {
    expect(await resolveIncludes([])).toBe('')
  })

  it('fetches a github: string include', async () => {
    mockFetch('# Remote Rules')
    const result = await resolveIncludes(['github:owner/repo'])
    expect(result).toBe('# Remote Rules')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/owner/repo/main/GUARD.md',
    )
  })

  it('fetches a github: string include with subpath', async () => {
    mockFetch('# JS Rules')
    await resolveIncludes(['github:owner/repo/javascript'])
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/owner/repo/main/javascript/GUARD.md',
    )
  })

  it('fetches an object include with custom ref and path', async () => {
    mockFetch('# Custom')
    await resolveIncludes([{ github: 'owner/repo', ref: 'v1', path: 'rules/GUARD.md' }])
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/owner/repo/v1/rules/GUARD.md',
    )
  })

  it('warns and returns empty on HTTP error', async () => {
    mockFetch('', false)
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const result = await resolveIncludes(['github:owner/repo'])
    expect(result).toBe('')
    expect(stderrSpy.mock.calls.map((c) => c[0]).join('')).toContain('HTTP 404')
    stderrSpy.mockRestore()
  })

  it('warns and returns empty on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ENOTFOUND')))
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const result = await resolveIncludes(['github:owner/repo'])
    expect(result).toBe('')
    expect(stderrSpy.mock.calls.map((c) => c[0]).join('')).toContain('ENOTFOUND')
    stderrSpy.mockRestore()
  })

  it('warns and skips unknown include format', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const result = await resolveIncludes(['npm:some-package'])
    expect(result).toBe('')
    expect(stderrSpy.mock.calls.map((c) => c[0]).join('')).toContain('unknown include format')
    stderrSpy.mockRestore()
  })

  it('joins multiple includes with double newline', async () => {
    mockFetch('# Rules')
    const result = await resolveIncludes(['github:a/b', 'github:c/d'])
    expect(result).toBe('# Rules\n\n# Rules')
  })
})
