---
id: ai-vocabulary
severity: warning
description: Replace AI-coded vocabulary with direct, specific wording
depends_on: []
---

## Rule

Prose should avoid stock AI-writing vocabulary when the word adds polish without adding meaning.

## Fail when

- The text uses Tier 1 terms such as `delve`, `tapestry`, `robust`, `comprehensive`, `seamless`, `leverage`, `utilize`, `pivotal`, `actionable`, or `impactful`
- A paragraph clusters multiple Tier 2 terms such as `harness`, `navigate`, `foster`, `elevate`, `streamline`, `empower`, `nuanced`, or `ecosystem`
- The text uses dense vague praise such as repeated `significant`, `innovative`, `dynamic`, `compelling`, `exceptional`, or `state-of-the-art`

## Pass when

- The prose uses plain alternatives such as `use`, `strong`, `reliable`, `important`, `specific`, or `because`
- Technical terms remain when they are literal domain language, not metaphor or padding
- Vague praise is replaced with numbers, examples, comparisons, or concrete outcomes

## Examples

### Bad

```md
This robust platform leverages a seamless ecosystem to deliver impactful insights.
```

### Good

```md
This platform connects billing data to support tickets so operators can spot churn risks earlier.
```

## Check

1. Scan for high-confidence AI vocabulary and inflated phrases.
2. Report clustered lower-confidence terms only when they make the paragraph feel generic.
3. Suggest direct replacements or ask for a specific fact where a replacement would still be vague.
