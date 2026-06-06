# Parallel Agent Workflow Design

Date: 2026-06-06

## Problem

The current checker relies on a bounded agent loop: evaluate, optionally ask the
same model to self-check, then stop at `max_iterations`. That shape is hard to
reason about because later turns are not independent reviews — the model sees
its own prior output and tends to confirm rather than challenge it. It also makes
latency scale with iteration count and gives weak control over which package
rules run in parallel. In a project with multiple packages and rules, every rule
runs sequentially even when there are no data dependencies between them.

Guard package mode already has rule-level ordering through `depends_on`. The new
workflow should make dependency structure first-class at two levels: packages
first, then rules inside each package. It should gather the relevant policy
context, summarize the target changes once, run independent agents in parallel
when the package and rule DAGs allow it, score each issue, filter low-confidence
findings, and print a deterministic review.

This design is inspired by the Claude Code code-review plugin workflow, which
uses multiple independent review agents and confidence scoring, but Guard should
remain input-based rather than PR-based.

## Goals

- Replace `max_iterations` as the main quality mechanism with independent,
  parallel rule agents.
- Keep `guard check` usable for diffs, files, and stdin; do not require a pull
  request.
- Use package dependencies and rule `depends_on` declarations as execution DAGs.
- Gather selected package `GUARD.md` files and dependent package `GUARD.md` files
  before launching agents.
- Summarize target changes once and share that summary with every rule agent.
- Require every finding to include a `score` field from `0` to `100`.
- Filter findings with `score < 80` from the final review.
- Preserve deterministic output ordering.

## Non-Goals

- Posting GitHub PR comments.
- Git blame or repository history analysis.
- Auto-fixing violations.
- A general workflow engine beyond the package rule DAG.

## Workflow

`guard check` should run this pipeline:

1. **Decide whether a check is needed.**
   For stdin input, always check. For files and diffs, skip only when the
   collected target is empty. PR state, draft status, and prior review comments
   are outside Guard's scope.

2. **Load policy context.**
   Resolve the active project mode. In package mode, load selected packages,
   validate the package DAG, load package rules, validate each package's rule
   DAG, and gather each selected package and rule `GUARD.md`. For every selected
   package, also gather the `GUARD.md` files for its transitive package
   dependencies. In single-policy mode, gather the resolved root policy and any
   includes exactly as today.

3. **Summarize the target.**
   Ask the model for a concise structured summary of the changed input. The
   summary should list changed files, affected areas, and notable behavior
   changes. It must not produce findings and it must not decide pass/fail.

4. **Run independent rule agents.**
   Schedule packages by package DAG levels. Inside each ready package, schedule
   rules by rule DAG levels. All ready rule agents run concurrently. A dependent
   package or rule runs only after every dependency's status is `pass` (including
   filtered-only results; see step 6). If a dependency's status is `fail` or
   `error`, the dependent package or rule is marked `abort`, matching the existing
   package semantics.

5. **Score findings.**
   Each rule agent returns findings with confidence scores. If the first rule
   response omits a score or returns a non-numeric score, the rule result is
   `error`; Guard does not ask the same agent to iterate.

6. **Filter findings.**
   Drop findings with `score < 80` before aggregation. A rule with only filtered
   findings is treated as `pass` and should include a summary such as
   `Only low-confidence findings were filtered.`

7. **Output review.**
   Print the existing Guard report shape, with each finding showing its score.
   Package reports also show aborted and errored rules as they do today.

## Check Needed

The skip decision should be deterministic and local:

- `stdin`: check when `raw` is present, even if it is an empty string supplied by
  the caller.
- `files`: skip when no files were collected.
- `diff`: skip when no changed files and no raw diff content were collected.

Skipped checks return a passing result with summary `No input to check.` and no
findings. They should not call the model.

**Implementation note:** The existing `buildTargetContent` uses `if (target.raw)`
which is falsy for `""`. Change this guard to `if (target.raw !== undefined)` so
that an explicitly empty stdin still emits the raw content section. The skip-check
decision should also use `target.raw !== undefined`, not truthiness.

## Policy Context

Each rule agent receives only the context needed for that rule:

- The selected package's root `GUARD.md`, when present.
- The root `GUARD.md` for transitive package dependencies, when present.
- The rule's own parsed `GUARD.md`.
- The parsed `GUARD.md` content for transitive rule dependencies.
- Helper script output for the rule, if any.
- The shared target summary.
- The original target content.

Dependency `GUARD.md` files are context, not additional checks. A dependent
agent may use them to understand upstream assumptions, but it must only report
violations for its own rule.

Single-policy mode has no rule DAG. It should run one check agent with the
resolved root policy and the shared target summary. This keeps compatibility
while still requiring scored findings. In single-policy mode, the score >= 80
filter applies and `filtered_findings` is tracked identically to package mode.

## Package Enumeration

In package mode, Guard determines the set of packages to check from the project's
guard registry. The registry is the existing mechanism that maps package IDs to
local directories. All packages registered in the registry are included in the
check. Future work may add per-run selection flags, but the first implementation
uses the full registered set.

Each package directory must contain a `package.json`. The filesystem path to
the dependency package is resolved from the registry by package ID.

## Package DAG

The package graph is:

```text
package dependency -> dependent package
```

Inter-package dependencies are declared in each package's `package.json` under
the `"guard"` key:

```json
{
  "guard": {
    "dependsOn": ["other-package-id", "base-package-id"]
  }
}
```

`dependsOn` is an array of package IDs that must appear in the registry. The
first implementation can omit the `"guard"` key entirely to declare a level-zero
package with no dependencies. Guard must not infer dependency edges from import
statements or file paths.

When a package depends on another package, Guard gathers the dependency
package's root `GUARD.md` and makes it available as context to the dependent
package's rule agents. Dependency package rules still run as their own checks;
their `GUARD.md` files are not copied into the dependent package as extra rules.

Missing package dependencies (IDs in `dependsOn` that are not in the registry)
and package cycles are configuration errors with exit code `2`.

## Scheduling

The runner should convert package dependencies and rule `depends_on` into DAG
levels:

```text
package level 0: packages with no package dependencies
package level 1: packages whose dependencies have all reached `pass` status

rule level 0: rules with no rule dependencies
rule level 1: rules whose dependencies have all reached `pass` status
rule level N: repeat until every selected rule is pass, fail, error, or abort
```

When a dependency's status is `fail` or `error`, dependent packages and rules are
immediately marked `abort` without entering the ready queue. The rationale for
aborting on `fail` (not just `error`) is correctness: rules that depend on an
upstream check implicitly assume that upstream violations have been addressed.
Running a dependent check in the presence of unresolved upstream violations would
produce results against a non-compliant baseline. Aborted rules are reported in
the output so the user knows which checks were skipped and why.

Within each ready package and rule level, launch agents concurrently up to a
configurable global limit. The first implementation can use
`GUARD_AGENT_CONCURRENCY`, defaulting to `4`. Parse with `parseInt(value, 10)`;
reject non-positive or `NaN` values with exit code `2`. This is an execution
control, not a policy feature, so it does not belong in `GUARD.md`.

Output order must remain stable. All sort keys are derived from input content or
structural metadata, not from model-generated text, to guarantee run-to-run
determinism:

1. Package results sorted by package topological order, then lexical package id.
2. Rule results sorted by rule topological order, then lexical rule id.
3. Findings sorted by package order, then rule order, then file (lexical), then
   line (numeric), then score descending.
4. Equal findings from different agents are de-duplicated by
   `rule + file + line + message`; when duplicates differ in score or other
   fields, retain all fields from the highest-scoring duplicate.

## Agent Roles

Guard does not need fixed global roles like "bug detector" or "history
analyzer". Package rules already define review focus. The independent agents are
therefore rule-scoped:

- One summarizer agent per `guard check` invocation. The summarizer receives only
  the target changes (files, diffs, or stdin content). It does not receive policy
  or rule context. It produces a neutral summary only.
- One checker agent per selected rule, launched when the DAG permits it.
- Optional future scorer agents can independently rescore findings, but the
  first implementation should let each checker agent score its own findings.

Running two agents for the same rule is intentionally out of scope for the first
implementation. It doubles cost and needs reconciliation rules. Add it later
only if real false-negative data justifies it.

## Confidence Scoring

Every finding must include `score`, an integer from `0` to `100`.

Score meanings:

- `0`: Not confident, false positive.
- `25`: Somewhat confident, might be real.
- `50`: Moderately confident, real but minor.
- `75`: Highly confident, real and important.
- `100`: Absolutely certain, definitely real.

Filtering threshold:

- Keep findings with `score >= 80`.
- Drop findings with `score < 80`.

The threshold is set at 80 rather than the 75 anchor point to require a small
margin above "highly confident." A score of exactly 75 reflects the minimum bar;
the 5-point buffer reduces borderline cases where the agent is uncertain but
rounds up. This threshold is provisional: if post-deployment analysis shows real
violations clustering at 75–79, lower it to 75.

The prompt should tell agents to score conservatively. A finding should reach
`80` only when it is introduced by the checked input, directly supported by the
rule text, and actionable without guessing. Agents should score each finding
independently against the rubric above without being told the threshold — this
prevents clustering at the cutoff.

## Type Changes

`GuardFinding` gains a required score:

```ts
export type GuardFinding = {
  severity: 'info' | 'warning' | 'error'
  score: number  // integer, 0–100; Zod: z.number().int().min(0).max(100)
  rule?: string
  file?: string
  line?: number
  message: string
  evidence?: string
  suggestion?: string
}
```

The parsed model output remains `GuardEvalResult`, but the JSON schema requires
`score` for every finding:

```ts
export type GuardEvalResult = {
  summary: string
  findings: GuardFinding[]
  passed: boolean
}
```

The `passed` field maps to `RuleResult.status` as follows: `passed: true` with
no retained findings → `status: 'pass'`; `passed: false` with retained findings
→ `status: 'fail'`. Parse errors and missing/invalid scores set
`status: 'error'` regardless of the `passed` field value.

`RuleResult` should keep all retained findings. To support debugging filtered
issues without printing them by default, add an optional filtered count:

```ts
export type RuleResult = {
  rule_id: string
  status: 'pass' | 'fail' | 'error' | 'abort'
  findings: GuardFinding[]
  filtered_findings: number  // Zod: z.number().int().min(0)
  summary: string
}
```

The public report should display the score beside severity:

```text
ERROR score=92 no-secret-logging src/auth.ts:42
```

## Summarizer Contract

The summarizer agent receives the original target content only (no policy, no
rules). It must respond with a single fenced JSON block:

```json
{
  "changed_files": ["src/auth.ts", "src/db.ts"],
  "affected_areas": ["authentication", "database layer"],
  "behavior_changes": "Adds token refresh logic and removes direct SQL calls."
}
```

All three fields are required strings or arrays of strings. If the summarizer
returns unparseable output, Guard emits a warning and proceeds with rule agents
using the original target content without a summary. The summarizer does not
produce findings and does not decide pass/fail.

The summary is injected into each checker agent's prompt as an additional context
section before the target content:

```
=== Target Summary ===
Changed files: src/auth.ts, src/db.ts
Affected areas: authentication, database layer
Behavior changes: Adds token refresh logic and removes direct SQL calls.
```

## Prompt Contract

Checker agents must respond with a single fenced JSON block:

```json
{
  "summary": "Short result for this rule.",
  "passed": false,
  "findings": [
    {
      "severity": "error",
      "score": 92,
      "rule": "no-secret-logging",
      "file": "src/auth.ts",
      "line": 42,
      "message": "Secret value is logged.",
      "evidence": "console.log(secret)",
      "suggestion": "Remove the log or redact the secret before logging."
    }
  ]
}
```

Invalid output is a rule error. Guard should not silently convert parse errors to
pass because that hides broken checks.

`parseFindings` throws a typed `GuardParseError` on any failure (invalid JSON,
missing `score`, non-integer score, score outside 0–100). `runGuardAgent` catches
this and returns `{ status: 'error', summary: error.message, findings: [],
filtered_findings: 0 }`. There is no retry.

## Error Handling

- Package load and DAG validation errors still exit `2`.
- Summarizer parse failure emits a warning to stderr and proceeds without a
  summary. Rule agents receive only the original target content. The check is not
  aborted. Network or model errors on the summarizer call also degrade to
  no-summary mode rather than aborting.
- Rule parse/output errors mark that rule `error` and exit `2`.
- Helper script failure marks that rule `error` and exits `2`.
- Dependency `fail` or `error` aborts downstream rules without additional model
  calls (see Scheduling for rationale).
- `GUARD_AGENT_CONCURRENCY` set to a non-positive or non-numeric value exits `2`.

## Compatibility

`max_iterations` should be deprecated for package mode. During migration:

- Keep the CLI option accepted to avoid breaking existing commands.
- Ignore it in package mode and emit a warning when it is explicitly set.
- In single-policy mode, replace iterative self-checking with one scored checker
  call. If compatibility requires a transition period, keep `max_iterations`
  only for single-policy mode and mark it deprecated in help text.

Existing unscored findings from old mock responses and tests must be updated.
There is no default score because inventing one would weaken the output contract.

The `createModel` mock provider currently sizes its response queue as
`Array.from({ length: runtime.max_iterations }, ...)`. Under the new design,
each rule agent is a single-shot call, so the mock queue should be refactored to
register an open-ended response factory rather than a fixed-size array. Update
this alongside the scheduler change (Implementation Plan step 5).

## Implementation Plan

1. Add `score` to `GuardFinding`, update prompt text, and require it in
   `parseFindings`. Add `GuardParseError` and change `parseFindings` to throw on
   failure.
2. Add target summarization as a separate model call. Add the Summarizer Contract
   JSON schema and the no-summary fallback path.
3. Add package enumeration: read the guard registry to collect the package set;
   read `package.json` `"guard.dependsOn"` for inter-package dependencies.
4. Add package DAG validation (cycle detection, missing dependency IDs) and
   dependent package `GUARD.md` gathering.
5. Replace the package runner's sequential loop with package-level and rule-level
   concurrent scheduling using the DAG level algorithm. Refactor `createModel`
   mock to use an open-ended response factory.
6. Filter findings below score `80` before aggregating rule and package results.
7. Update report formatting to print scores and `filtered_findings` count in
   verbose/debug mode.
8. Deprecate `max_iterations` in CLI help and runtime handling.

## Verification

Tests should cover:

- `GuardFinding` parsing requires `score`.
- Scores must be numeric integers from `0` through `100`.
- Missing or invalid score produces a rule error.
- Findings with score `79` are filtered.
- Findings with score `80` are retained.
- Filtered-only rule result is `pass`.
- Report output includes score for each retained finding.
- Empty input skips without model calls.
- Summarizer parse failure proceeds without a summary; rule agents still run.
- Summarizer runs once per check and its output is injected into each checker
  agent's prompt.
- Independent level-zero packages run concurrently.
- Dependent package `GUARD.md` files are included as context.
- Package dependency failure aborts dependent packages without model calls.
- Package dependency error also aborts dependent packages without model calls.
- Independent level-zero package rules run concurrently inside each package.
- Dependent rules wait for prerequisites.
- Dependency failure aborts downstream rules without model calls.
- Output ordering is stable across concurrent runs.
- Sort key does not include model-generated text; findings sort by file, line,
  score descending.
- Duplicate findings from different agents with differing scores retain all
  fields from the highest-scoring duplicate.
- `GuardEvalResult.passed: false` maps to `RuleResult.status: 'fail'`.
- `parseFindings` throws `GuardParseError`; caller sets `status: 'error'`.
- `GUARD_AGENT_CONCURRENCY` set to a non-positive value exits `2`.
- `max_iterations` is ignored or deprecated according to mode.
- Single-policy mode applies the score filter and tracks `filtered_findings`.

Coverage must remain 100% for changed source files.

## References

- Claude Code code-review plugin README:
  https://github.com/anthropics/claude-code/blob/main/plugins/code-review/README.md
