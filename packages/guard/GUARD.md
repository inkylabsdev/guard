---
severity_threshold: warning
---

# Guard Policy for @inkylabsdev/guard

## Do

- Test coverage is always 100%.
- Both test and lint are passed before commiting code.
- Handle errors explicitly.

## Do Not

- Do not log secrets.
- Do not swallow errors silently.
- Do not leave TODO_SECRET markers in code.
