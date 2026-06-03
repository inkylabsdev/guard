import { describe, expect, it } from 'vitest'
import { fauxAssistantMessage, fauxThinking } from '@earendil-works/pi-ai'
import { parseFindings } from '../src/agent/parseFindings.js'

const fallback = { summary: 'Parse error', findings: [], passed: true }

describe('parseFindings', () => {
  it('parses a valid JSON block from text content', () => {
    const result = parseFindings(fauxAssistantMessage([
      fauxThinking('considering'),
      { type: 'text', text: 'prefix ```json\n{"summary":"bad","findings":[{"severity":"error","message":"x"}],"passed":false}\n``` suffix' },
    ]))
    expect(result).toEqual({
      summary: 'bad',
      findings: [{ severity: 'error', message: 'x' }],
      passed: false,
    })
  })

  it('returns the fallback when no JSON block exists', () => {
    expect(parseFindings(fauxAssistantMessage('plain text'))).toEqual(fallback)
  })

  it('returns a fresh fallback object', () => {
    const first = parseFindings(fauxAssistantMessage('plain text'))
    first.findings.push({ severity: 'error', message: 'mutated' })
    expect(parseFindings(fauxAssistantMessage('plain text'))).toEqual(fallback)
  })

  it('returns the fallback for malformed JSON', () => {
    expect(parseFindings(fauxAssistantMessage('```json\n{\n```'))).toEqual(fallback)
  })

  it('returns the fallback when JSON has the wrong shape', () => {
    expect(parseFindings(fauxAssistantMessage('```json\n{"summary":"x"}\n```'))).toEqual(fallback)
  })

  it('takes the first JSON block', () => {
    const message = fauxAssistantMessage('```json\n{"summary":"first","findings":[],"passed":true}\n```\n```json\n{"summary":"second","findings":[],"passed":true}\n```')
    expect(parseFindings(message).summary).toBe('first')
  })
})
