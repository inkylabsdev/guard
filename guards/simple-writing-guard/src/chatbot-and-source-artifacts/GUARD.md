---
id: chatbot-and-source-artifacts
severity: error
description: Remove chat-interface artifacts, fake source marks, placeholders, and model disclaimers
depends_on: []
---

## Rule

Published prose must not contain visible traces of chat tools, unfinished templates, or source uncertainty disguised as content.

## Fail when

- The text includes chatbot artifacts such as `I hope this helps`, `Certainly`, `Absolutely`, `Great question`, `Feel free to reach out`, or `Let me know if you need anything else`
- The text leaks reasoning scaffolding such as `Let me think step by step`, `Breaking this down`, `To approach this systematically`, or `Here's my thought process`
- The text contains cutoff disclaimers such as `As of my last update`, `I don't have access to real-time data`, or `specific details are limited based on available information`
- The text ships placeholders such as `[Your Name]`, `[INSERT SOURCE URL]`, `2025-XX-XX`, or `<!-- Add citation -->`
- The text leaks citation or URL fingerprints such as `contentReference[oaicite:0]`, `oai_citation`, `[attached_file:1]`, `grok_card`, or `utm_source=chatgpt.com`

## Pass when

- Chat prefaces and sign-offs are removed entirely
- Real citations replace leaked citation tokens
- Missing facts are looked up or the claim is removed
- Placeholders are filled with real content before publishing

## Examples

### Bad

```md
Great question! As of my last update, pricing may vary. See [INSERT SOURCE URL] contentReference[oaicite:0]{index=0}.
```

### Good

```md
Pricing starts at $19 per seat according to the vendor's published pricing page.
```

## Check

1. Treat visible chat artifacts, placeholders, and leaked citation markup as publishing blockers.
2. Report the exact token or phrase.
3. Recommend deletion unless a real source or fact can replace it.
