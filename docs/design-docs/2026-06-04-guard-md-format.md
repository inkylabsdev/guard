# Packaged Rule GUARD.md Format Design

This document defines the `GUARD.md` format for one rule inside a guard package.
It is an enhancement to the current root-level `GUARD.md` policy file, which can
grow too large when it contains many unrelated checks.

Package discovery, rule loading, dependency ordering, and result aggregation are
specified in `2026-06-04-guard-package-design.md`.

## Frontmatter

```yaml
---
id: early-array-length-check
severity: warning
description: Check array length before expensive comparisons
depends_on: []
---
```

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Machine-readable slug, unique within the package, matches the rule directory name |
| `severity` | `info` \| `warning` \| `error` | yes | Severity when this rule fails |
| `description` | string | yes | One-line human summary |
| `depends_on` | string[] | no | Rule ids that should run before this rule |

Scope is not declared in an individual rule file. Scope is determined by the
`guard check` invocation arguments and by package-level rule selection.

`depends_on` is limited to rule ordering. It does not imply that a dependency
failure automatically fails or skips this rule.

## Body Sections

### `## Rule`

A plain-English description of what the rule enforces.

### `## Fail when`

Bulleted list of conditions that constitute a violation.

### `## Pass when`

Bulleted list of conditions that satisfy the rule.

### `## Examples`

`### Bad` and `### Good` subsections with code snippets.

### `## Check`

Ordered instructions describing how the agent should evaluate the rule. The
instructions may reference helper scripts, regex passes, AST queries, LLM
judgment, or any combination.

The package runner is responsible for deciding which referenced operations it can
execute. If a required operation cannot run, the rule result should be reported
as an evaluation error rather than silently skipped.

## Full Example

```markdown
---
id: early-array-length-check
severity: warning
description: Check array length before expensive comparisons
depends_on: []
---

## Rule

When comparing arrays with expensive operations, check length first.

## Fail when

- Code compares two arrays using sort/join/deepEqual
- No length check exists before the expensive comparison

## Pass when

- There is an early `a.length !== b.length` check
- Or array sizes are guaranteed equal by previous logic

## Examples

### Bad

\```ts
return a.sort().join() === b.sort().join()
\```

### Good

\```ts
if (a.length !== b.length) return false
return a.sort().join() === b.sort().join()
\```

## Check

1. Run `scripts/find-array-comparisons.sh` to locate candidate expressions
2. For each match, check whether an early length guard precedes it
3. If no length guard found, report a failure with the file and line
```
