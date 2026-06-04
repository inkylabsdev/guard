---
id: structure-and-rhythm
severity: info
description: Catch over-structured, uniform, low-density prose that reads generated
depends_on: ["formatting"]
---

## Rule

Prose should have a clear through-line, varied rhythm, and enough information density to justify its length.

## Fail when

- Paragraphs are uniformly similar in length and could be rearranged without breaking the argument
- Every sentence has the same polished mid-length rhythm
- A short piece has excessive headers, numbered lists, or bullet lists
- Bullet lists contain five or more bare noun phrases with no verbs and no checkable claims
- The text cycles synonyms to avoid repeating the clearest term
- Longer general prose has very low vocabulary diversity because it repeats the same abstract nouns
- Paragraphs restate the premise without adding a new fact, claim, or turn

## Pass when

- Paragraph order matters because each one builds from the previous one
- Sentence and paragraph lengths vary naturally
- Lists are used only when the content is genuinely list-shaped
- Repeated terms stay repeated when repetition is clearer than forced synonym variety
- Each paragraph contributes new information

## Examples

### Bad

```md
Key benefits:

- Stable performance
- Reliable connectivity
- Optimized operations
- Effective utilization
- Consistent outcomes
```

### Good

```md
The system stayed online for the full 12-hour run, and failed shares remained under 1%.
```

## Check

1. Read for structure before editing individual words.
2. Flag lists, headings, or paragraphs that add shape without adding information.
3. Recommend a full rewrite when several categories fire and the rhythm is uniformly polished.
