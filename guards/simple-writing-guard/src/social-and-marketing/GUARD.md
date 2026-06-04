---
id: social-and-marketing
severity: warning
description: Avoid promotional filler, hashtag stuffing, engagement hooks, and manufactured notability
depends_on: ["ai-vocabulary", "boilerplate-phrases"]
---

## Rule

Marketing and social prose should earn attention with specifics, not broad hype, reveal hooks, or prestige stacking.

## Fail when

- The text uses brochure language such as `nestled`, `vibrant hub`, `thriving ecosystem`, `breathtaking`, or `showcasing`
- The text uses formulaic challenge language such as `despite challenges, X continues to thrive`
- A post ends with six or more hashtags, especially broad tags such as `#AI`, `#Web3`, `#Innovation`, `#FutureTech`, or `#Technology`
- The text uses reveal hooks such as `The catch?`, `The kicker?`, `Here's the thing`, `Plot twist`, or `The result?`
- The text name-drops publications, investors, or institutions without explaining why the source matters
- The text claims novelty with phrases such as `nobody is talking about`, `the insight everyone's missing`, or `coined the phrase` without evidence

## Pass when

- Descriptions use observable facts, numbers, or concrete traits
- Hashtags are limited to two or three specific tags when they help discovery
- Prestigious references are tied to a specific claim or context
- Novelty claims are replaced with what the person or project actually did

## Examples

### Bad

```md
The catch? This vibrant ecosystem continues to thrive despite challenges. #AI #Web3 #Crypto #Innovation #FutureTech #Technology
```

### Good

```md
The project kept weekly active users above 18,000 after the fee change.
```

## Check

1. Scan for hype phrases, reveal hooks, broad hashtag blocks, and unsupported novelty claims.
2. Ask whether each attention cue gives the reader new information.
3. Replace empty promotion with concrete evidence or cut it.
