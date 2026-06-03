# Comparisons

## SKILL.md vs GUARD.md

> Skill is knowledge. Guard is constraint.

Skill teaches the model how to do something better. It belongs to the **generation phase**.

Guard judges whether a result meets the bar. It belongs to the **evaluation phase**.

A Guard is a verifiable contract: a set of requirements that must hold after the work is done. Examples:

- Security Requirements
- Accessibility Requirements
- Design Requirements
- Coding Standards

Below is a short comparison table:

| Dimension | SKILL | GUARD.md |
|-----------|-------|----------|
| Nature | How to do something | What must be satisfied |
| Goal | Improve capability | Ensure quality |
| Content | Workflows, experience, proven methods | Policies, rules, requirements |
| Output | Produces results | Checks results |
| Focus | Success | Correctness |
| When to use | Before doing | After doing |
| Example | How to design a React page | Page must conform to the design system |
| Example | How to write an AI Agent | Agent must not leak secrets |
| Example | How to optimize SQL | SQL must not have N+1 queries |

## Code Review vs Guard

> Code review applies human judgment. Guard checks written rules.

Code review asks whether a change is good: whether the design makes sense, the tradeoffs are acceptable, the abstraction is useful, and the work fits the team's goals.

Guard asks whether a change violates the rules the team has already written down. It is useful for checks that are repeatable, easy to forget, and expensive for reviewers to re-check by hand.

| Dimension | Code Review | Guard |
|-----------|-------------|-------|
| Main actor | Human reviewer | Agent, LLM, or rule executor |
| Input | Pull request, diff, and project context | Diff, files, logs, test output, or stdin |
| Source of truth | Team knowledge and reviewer experience | GUARD.md, policies, skills, and constraints |
| Output | Comments, approval, or requested changes | Pass/fail report with findings and evidence |
| Best at | Design judgment, ownership, intent, tradeoffs | Policy checks, repeatable review points, known failure patterns |
| Weakness | Slow and reviewer-dependent | Needs clear rules and enough context |
| Timing | Usually after code is written | Before a PR, in CI, or inside an agent loop |

Guard is strongest for rules such as:

- Do not add unauthenticated endpoints.
- Never log tokens, API keys, or user PII.
- Background tasks must be idempotent.
- Public API changes must update the OpenAPI schema.
- Retry loops must have backoff and a maximum attempt count.

Human reviewers should still own ambiguous calls: product behavior, architecture, team ownership, long-term maintainability, and whether the change solves the right problem.

The practical relationship is simple: Guard catches the review comments your team is tired of repeating, so code review can focus on judgment.
