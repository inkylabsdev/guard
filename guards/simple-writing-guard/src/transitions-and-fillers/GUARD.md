---
id: transitions-and-fillers
severity: warning
description: Remove generic transitions, filler phrases, acknowledgment loops, and confidence calibration
depends_on: ["sentence-structure"]
---

## Rule

Transitions and emphasis cues should clarify the relationship between ideas. They should not tell the reader how to feel or restate the prompt.

## Fail when

- The text uses generic transitions such as `Moreover`, `Furthermore`, `Additionally`, `In today's X`, `In an era where`, `When it comes to`, or `At the end of the day`
- The text uses filler phrases such as `It is important to note that`, `In terms of`, `The reality is that`, or `Let's be clear`
- The text calibrates confidence with repeated `Notably`, `Interestingly`, `Surprisingly`, `Importantly`, `Certainly`, `Undoubtedly`, `fundamentally`, or `make no mistake`
- The text opens with `Let's explore`, `Let's take a look`, `Let's break this down`, or `Let's examine`
- The text acknowledges the prompt before answering, such as `You're asking about`, `To answer your question`, or `The question of whether`
- The text self-labels significance with `that last move is the contrarian one`, `this is the interesting part`, or `the real story is`

## Pass when

- The connection between ideas is clear from the substance or a simple conjunction
- Filler lead-ins are removed
- Emphasis is earned by evidence, placement, or specificity
- The answer starts with the answer

## Examples

### Bad

```md
Let's break this down. Notably, it is important to note that the real story is developer trust.
```

### Good

```md
Developer trust improved because reviewers can see which files each check inspected.
```

## Check

1. Scan starts of sentences and sections for generic transition scaffolding.
2. Flag repeated reader-steering or prompt-restating phrases.
3. Prefer deletion unless a specific bridge sentence is needed.
