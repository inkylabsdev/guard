---
id: boilerplate-phrases
severity: warning
description: Remove template phrases, generic conclusions, and unfalsifiable future narratives
depends_on: ["ai-vocabulary"]
---

## Rule

Generated slot-fill phrases should be cut or replaced with claims that name the actual audience, change, constraint, or evidence.

## Fail when

- The text uses template phrases such as `a step toward`, `a step forward for`, `whether you're X or Y`, or `I recently had the pleasure of`
- The conclusion says `the future looks bright`, `only time will tell`, `as we move forward`, or `one thing is certain`
- The text predicts that something `may become one of the most important narratives`, `could become the defining trend`, or is `poised to become the next major chapter`
- Boilerplate phrases repeat, such as `the integration of`, `the intersection of`, `community-driven`, `long-term sustainability`, or `user engagement`

## Pass when

- The sentence names the specific capability, benchmark, audience, or outcome
- Predictions are falsifiable and include enough detail to evaluate later
- Closings end on the argument, not a generic optimism phrase

## Examples

### Bad

```md
Whether you're a founder or an enterprise architect, this is a major step forward for AI infrastructure. Only time will tell.
```

### Good

```md
The release cuts indexing time from 40 minutes to 12 minutes for teams with more than 10 million events.
```

## Check

1. Look for slot-fill constructions that could apply to almost any topic.
2. Flag future-narrative closers that avoid a testable claim.
3. Require each rewritten sentence to name the concrete change or remove the sentence.
