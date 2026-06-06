import { describe, expect, it } from 'vitest'
import { fauxAssistantMessage, fauxThinking } from '@earendil-works/pi-ai'
import { GuardParseError, parseFindings } from '../src/agent/parseFindings.js'

describe('parseFindings', () => {
  it('parses a valid JSON block from text content', () => {
    const result = parseFindings(fauxAssistantMessage([
      fauxThinking('considering'),
      { type: 'text', text: 'prefix ```json\n{"summary":"bad","findings":[{"severity":"error","score":91,"message":"x"}],"passed":false}\n``` suffix' },
    ]))
    expect(result).toEqual({
      summary: 'bad',
      findings: [{ severity: 'error', score: 91, message: 'x' }],
      passed: false,
    })
  })

  it('throws when no JSON block exists', () => {
    expect(() => parseFindings(fauxAssistantMessage('plain text'))).toThrow(GuardParseError)
  })

  it('throws for malformed JSON', () => {
    expect(() => parseFindings(fauxAssistantMessage('```json\n{\n```'))).toThrow(GuardParseError)
  })

  it('throws when JSON has the wrong shape', () => {
    expect(() => parseFindings(fauxAssistantMessage('```json\n{"summary":"x"}\n```'))).toThrow(GuardParseError)
  })

  it('requires score on findings', () => {
    expect(() => parseFindings(fauxAssistantMessage('```json\n{"summary":"bad","findings":[{"severity":"error","message":"x"}],"passed":false}\n```'))).toThrow(GuardParseError)
  })

  it('requires integer score from 0 through 100', () => {
    expect(() => parseFindings(fauxAssistantMessage('```json\n{"summary":"bad","findings":[{"severity":"error","score":100.5,"message":"x"}],"passed":false}\n```'))).toThrow(GuardParseError)
    expect(() => parseFindings(fauxAssistantMessage('```json\n{"summary":"bad","findings":[{"severity":"error","score":101,"message":"x"}],"passed":false}\n```'))).toThrow(GuardParseError)
    expect(() => parseFindings(fauxAssistantMessage('```json\n{"summary":"bad","findings":[{"severity":"error","score":-1,"message":"x"}],"passed":false}\n```'))).toThrow(GuardParseError)
  })

  it('takes the first JSON block', () => {
    const message = fauxAssistantMessage('```json\n{"summary":"first","findings":[],"passed":true}\n```\n```json\n{"summary":"second","findings":[],"passed":true}\n```')
    expect(parseFindings(message).summary).toBe('first')
  })
})
