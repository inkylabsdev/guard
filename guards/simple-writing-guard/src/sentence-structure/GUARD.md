---
id: sentence-structure
severity: warning
description: Rewrite AI-shaped sentence structures into direct claims
depends_on: ["ai-vocabulary"]
---

## Rule

Sentences should make the claim directly instead of leaning on contrast cliches, hedge stacks, hollow intensifiers, or fake nuance.

## Fail when

- The text uses `It's not X, it's Y` or `This isn't about X, it's about Y` as a stock contrast
- Predictions stack hedges such as `could potentially`, `may eventually`, or `might ultimately`
- Abstract nouns are inflated with `real`, `actual`, `genuine`, or `true` without naming the false alternative
- The text uses vague endorsement such as `worth exploring`, `worth checking out`, or `worth your time`
- The sentence asks a rhetorical transition question such as `So why should you care?` or `What's next?`
- Parenthetical hedges such as `(and, increasingly, X)` or `(and perhaps more importantly, Y)` add nuance without commitment

## Pass when

- The sentence states the positive claim directly
- Predictions use one hedge at most and include enough detail to mean something
- `real` or `actual` is allowed only when the contrast is named
- Important asides become sentences, and unimportant asides are cut

## Examples

### Bad

```md
This isn't about speed, it's about trust. The change could potentially create real utility.
```

### Good

```md
The change builds trust by showing reviewers exactly which files were checked.
```

## Check

1. Scan for stock sentence frames and stacked hedges.
2. Decide whether the structure adds meaning or only performs balance, confidence, or nuance.
3. Suggest a direct rewrite that preserves the claim.
