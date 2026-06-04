---
id: formatting
severity: warning
description: Keep prose formatting restrained and human-readable
depends_on: []
---

## Rule

Formatting should serve clarity, not mimic generated copy.

## Fail when

- The text uses em dashes (`—`) or `--` as sentence punctuation more than once per 1,000 words
- Headings contain emoji or unnecessary title case
- Bold appears repeatedly for emphasis instead of structure
- Plain-text contexts contain a suspicious smart-punctuation signature, especially curly quotes combined with em dashes and otherwise polished typing
- The text stacks hyphenated modifiers such as `high-quality, well-architected, future-proof solution`

## Pass when

- Sentences use commas, periods, parentheses, or separate sentences instead of em dash rhythm
- Subheadings use sentence case unless the style guide requires title case
- Bold is rare and reserved for navigational structure
- Compound adjectives are hyphenated only where standard grammar requires it

## Examples

### Bad

```md
## 🚀 Strategic Negotiations And Key Partnerships

The product is a high-quality, well-architected, future-proof solution — and it "just works."
```

### Good

```md
## Strategic negotiations and key partnerships

The product keeps the existing API while cutting deployment time in half.
```

## Check

1. Scan headings, punctuation, bold spans, and compound modifiers.
2. Ignore quoted examples, code blocks, and contexts where the formatting is required.
3. Report formatting patterns that make the text look generated or over-polished.
