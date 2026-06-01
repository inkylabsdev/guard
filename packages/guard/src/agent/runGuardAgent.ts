import type { AgentInput, LLMEvaluateResult, GuardFinding } from '../types.js'
import type { LLMProvider } from '../providers/LLMProvider.js'
import { buildSystemPrompt, buildTargetContent, buildUserPrompt } from './buildPrompts.js'

export async function runGuardAgent(
  input: AgentInput,
  provider: LLMProvider,
): Promise<LLMEvaluateResult> {
  const { policy, target, config } = input
  const targetContent = buildTargetContent(target)
  const systemPrompt = buildSystemPrompt()

  const allFindings: GuardFinding[] = []
  let summary = ''

  for (let i = 1; i <= config.max_iterations; i++) {
    const result = await provider.evaluate({
      systemPrompt,
      userPrompt: buildUserPrompt(i),
      policyMarkdown: policy.content,
      targetContent,
      iteration: i,
    })

    summary = result.summary
    for (const f of result.findings) {
      if (!allFindings.some((existing) => existing.rule === f.rule && existing.message === f.message)) {
        allFindings.push(f)
      }
    }

    if (result.passed) break
  }

  return {
    summary,
    findings: allFindings,
    passed: allFindings.length === 0,
  }
}
