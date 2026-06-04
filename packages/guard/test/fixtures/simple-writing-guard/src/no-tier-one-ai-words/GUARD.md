---
id: no-tier-one-ai-words
severity: warning
description: Replace high-confidence AI-writing vocabulary with direct wording
depends_on: []
---

## Rule

Replace Tier 1 AI-writing terms on sight.

## Fail when

- The prose uses words such as `delve`, `robust`, `seamless`, `leverage`, `utilize`, or `pivotal`
- The prose uses inflated phrases such as `at its core`, `serves as`, `in order to`, or `due to the fact that`

## Pass when

- The prose uses direct words such as `use`, `strong`, `to`, `because`, or simply states the point

## Examples

### Bad

```md
At its core, this robust workflow leverages checks in order to deliver a seamless review.
```

### Good

```md
This workflow uses checks to keep reviews consistent.
```

## Check

1. Scan prose for Tier 1 terms listed in this rule
2. Report each term and suggest a direct replacement
