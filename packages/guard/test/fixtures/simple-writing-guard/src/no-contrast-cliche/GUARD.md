---
id: no-contrast-cliche
severity: info
description: Avoid not-X-but-Y contrast cliches unless they carry the argument
depends_on: ["no-em-dash"]
---

## Rule

Rewrite contrast cliches such as "It's not X, it's Y" into direct positive statements.

## Fail when

- The text uses `It's not X, it's Y`
- The text uses `This isn't about X, it's about Y`
- The same contrast shape appears more than once

## Pass when

- The sentence states the positive point directly
- A single contrast is used only when it materially sharpens the argument

## Examples

### Bad

```md
This isn't about speed, it's about trust.
```

### Good

```md
The change builds trust by making reviews predictable.
```

## Check

1. Scan prose for not-X-but-Y contrast patterns
2. Report each pattern and suggest a direct rewrite
