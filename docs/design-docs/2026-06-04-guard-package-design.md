# Guard Package Design

## Problem

The current root-level `GUARD.md` model works for small policy sets, but it does
not scale when a project needs many checks. A single large file makes checks hard
to maintain, hard to test individually, and expensive for the agent to evaluate
as one prompt.

Guard packages split policy into individual rule directories. The agent loads the
package, orders rules, and runs checks one by one against the selected input.

## Goals

- Support many small rule files instead of one large policy file
- Preserve the existing `guard check` input model
- Let rules declare simple ordering constraints
- Execute rules one by one so failures can be attributed to specific rule ids
- Keep package loading deterministic and testable

## Non-Goals

- Auto-fixing violations
- Interactive agent workflows
- Package publishing or registry behavior
- A full workflow engine for conditional branching

## Package Layout

```text
package.json
src/
  early-array-length-check/
    GUARD.md
    scripts/
      find-array-comparisons.sh
    evals/
      bad/
        sample.ts
      good/
        sample.ts
    references/
      array-performance.md
  no-secret-logging/
    GUARD.md
```

`package.json` is the package manifest used by the registry and the CLI to resolve
dependencies. Rule directories live under `src/`. Each rule directory must contain
exactly one `GUARD.md` in the packaged rule format.

The runner uses: `GUARD.md`, `scripts/` (if referenced by `## Check`), and any
files under `references/` that `GUARD.md` explicitly mentions. The `evals/`
directory is a convention for rule authors to store test fixtures; the runner
does not load or execute it.

## Package Detection

`guard check` reads `package.json` at the project root to determine what packages
to load. If `package.json` is present, package mode applies and the CLI resolves
packages from it. If no `package.json` is found, Guard falls back to the single
`GUARD.md` format.

The `package.json` is the authoritative manifest. It serves double duty as the
package registry descriptor and as the mechanism the CLI uses to resolve package
dependencies and discover rule directories.

## Rule Loading

The package loader should:

1. Read `package.json`
2. Discover immediate child directories under `src/`
3. Parse each `src/<rule-id>/GUARD.md`
4. Validate that each frontmatter `id` matches `<rule-id>`
5. Reject duplicate rule ids
6. Keep each rule's directory path for resolving scripts and references

Rule parse failures are package errors. Guard should fail before evaluating input
if any selected package is invalid. Package-load failures produce exit code `2`.

## Rule Selection

By default, all package rules are selected.

Future selection options may include tags, explicit rule ids, or severity
filters, but those are not part of this design. The first implementation should
avoid adding selection behavior until there is a concrete CLI requirement.

## Check Topology

Rules may declare `depends_on` in frontmatter. The runner uses this list to build
a directed graph:

```text
dependency -> dependent
```

For example, if `expensive-array-comparison` depends on `array-comparison-candidates`,
the candidate rule runs first.

Ordering rules:

- A rule with no dependencies can run as soon as input is available
- A rule must run after every selected dependency
- Dependencies must refer to selected rule ids in the same package
- Cycles are package errors
- Missing dependencies are package errors

The loader must reject at parse time any `depends_on` value that is not a valid simple rule id (e.g., contains a path separator or package-scoped prefix).

`depends_on` controls both ordering and execution gating:

- If all prerequisites passed → the dependent rule runs.
- If any prerequisite failed or errored → the dependent rule is **aborted**.

Abort is distinct from error: an aborted rule did not run because an upstream
check did not pass. It is not a rule failure and not an evaluation error. The
runner marks it `abort` and moves on to rules that are still runnable.

When multiple rules are ready at the same time, run them in lexical order by rule
id. This keeps output stable and tests deterministic.

## Execution Model

The runner evaluates one rule at a time:

1. Build a rule prompt from that rule's `GUARD.md`
2. Attach the same collected target input used by current `guard check`
3. Resolve rule-local files relative to the rule directory
4. Run any supported helper operations referenced by `## Check`
5. Ask the model to evaluate the rule
6. Parse findings and attach the rule id and rule severity (read from the `severity`
   field in the rule's `GUARD.md` frontmatter)

Each rule should produce one rule result:

```ts
type RuleResult = {
  rule_id: string
  status: 'pass' | 'fail' | 'error' | 'abort'
  findings: GuardFinding[]
  summary: string
}
```

Status definitions:
- `pass` — target satisfies the rule.
- `fail` — target violates the rule (findings present).
- `error` — Guard could not complete the check (evaluation or script failure).
- `abort` — a prerequisite rule did not pass, so this rule was not run.

The runner starts a clean model session for each rule.

## Helper Operations

`## Check` may reference helper scripts or other local assets. The runner should
only execute operations it explicitly supports.

Initial supported operation:

- Run an executable script under the rule directory

The runner passes target input to the script on stdin. The script's stdout is
captured and included in the rule prompt alongside the rule `GUARD.md` content.
Stderr is logged but not added to the prompt. If the script exits with a non-zero
code, the rule result status is `error`.

Rules must not rely on files outside their own rule directory except for the
target input supplied by `guard check`.

If a helper operation cannot run, the rule result status is `error`.

## Result Aggregation

Package results are aggregated into the existing Guard report model.

- `fail` results contribute findings
- `pass` results contribute no findings
- `abort` results are reported as skipped due to upstream failure; they do not contribute findings and do not set a non-zero exit code
- `error` results are reported clearly and produce exit code `2`
- The existing severity threshold applies to findings from failed rules

Exit codes: `0` = all rules passed or aborted, `1` = one or more rules failed (findings meet the severity threshold), `2` = one or more evaluation errors regardless of pass/fail outcome.

Rule findings should include the rule id. If the model omits a rule id, the
runner fills it from the current rule.

## Compatibility

Root-level `GUARD.md` remains supported. A project uses either the single-policy
format or a guard package; the presence of `package.json` at the guard root
determines the mode. The Package Detection section describes how `guard check`
selects the active mode.

Package composition (one package referencing another) is not part of this design.

## Verification

Tests should cover:

- Package mode detection from `package.json` + `src/` layout
- Single-policy mode detection from root `GUARD.md`
- Configuration error when both formats are present
- Valid package discovery
- Duplicate rule id rejection
- Directory/frontmatter id mismatch
- Invalid `depends_on` value rejection (path separator, empty string)
- Missing dependency rejection
- Cycle rejection
- Stable topological ordering
- Dependent rule is aborted when its dependency failed or errored
- Dependent rule runs when its dependency passed
- One-rule-at-a-time execution
- Rule id and severity propagation into findings
- Helper script receives target input on stdin
- Helper script non-zero exit sets rule status to `error`
- Evaluation error reporting
- Abort result reported without contributing findings or non-zero exit
- Exit code 2 on package-load failure
- Exit code 2 on evaluation error, exit code 1 on rule failure, exit code 0 on all pass or abort
