---
id: no-em-dash
severity: warning
description: Avoid em dashes and double-hyphen substitutes in prose
depends_on: []
---

## Rule

Plain text prose should not use em dashes or `--` as an em dash substitute.

## Fail when

- The text contains `—`
- The text contains `--` used as sentence punctuation

## Pass when

- Sentences use commas, periods, parentheses, or separate sentences instead

## Examples

### Bad

```md
The release is small — but it changes the review flow.
```

### Good

```md
The release is small, but it changes the review flow.
```

## Check

1. Scan prose for `—` and `--`
2. Report each match with the surrounding sentence as evidence
